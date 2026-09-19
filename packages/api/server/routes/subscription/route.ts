import { z } from "zod";
import { db, eq } from "@repo/db";
import { usersTable } from "@repo/db/schema";
import { TRPCError } from "@trpc/server";

import { router, protectedProcedure } from "../../trpc";
import { rateLimit } from "../../utils/rate-limit";
import {
  cancelRazorpaySubscription,
  createRazorpaySubscription,
  fetchRazorpaySubscription,
  razorpayConfig,
  razorpayConfigured,
  verifyRazorpaySubscriptionSignature,
} from "../../utils/razorpay";
import { isPaidStatus } from "../../utils/subscriptions";

const TAGS = ["Subscriptions"];

const subscriptionOutput = z.object({
  plan: z.enum(["free", "pro", "enterprise"]),
  subscriptionId: z.string().nullable(),
  subscriptionStatus: z.string().nullable(),
  company: z.string().nullable(),
  jobTitle: z.string().nullable(),
  razorpayConfigured: z.boolean(),
  proPlanConfigured: z.boolean(),
});

const updateProfileInput = z.object({
  name: z.string().min(1).max(80),
  company: z.string().trim().max(120).nullable().optional(),
  jobTitle: z.string().trim().max(120).nullable().optional(),
});

export const subscriptionRouter = router({
  /** Current plan + subscription state for the signed-in user. */
  getMySubscription: protectedProcedure
    .meta({
      openapi: { method: "GET", path: "/subscriptions/me", tags: TAGS },
    })
    .input(z.undefined())
    .output(subscriptionOutput)
    .query(async ({ ctx }) => {
      const [row] = await db
        .select({
          plan: usersTable.plan,
          subscriptionId: usersTable.subscriptionId,
          subscriptionStatus: usersTable.subscriptionStatus,
          company: usersTable.company,
          jobTitle: usersTable.jobTitle,
        })
        .from(usersTable)
        .where(eq(usersTable.id, ctx.user.id))
        .limit(1)
        .execute();

      return {
        plan: row?.plan ?? "free",
        subscriptionId: row?.subscriptionId ?? null,
        subscriptionStatus: row?.subscriptionStatus ?? null,
        company: row?.company ?? null,
        jobTitle: row?.jobTitle ?? null,
        razorpayConfigured: razorpayConfigured(),
        proPlanConfigured: Boolean(process.env.RAZORPAY_PRO_PLAN_ID),
      };
    }),

  /**
   * Creates a Razorpay subscription for the Pro plan and returns what the
   * Checkout needs to open. Re-uses an existing non-terminated subscription
   * instead of creating duplicates.
   */
  createProSubscription: protectedProcedure
    .meta({
      openapi: { method: "POST", path: "/subscriptions/pro", tags: TAGS },
    })
    .input(z.undefined())
    .output(
      z.object({
        subscriptionId: z.string(),
        keyId: z.string(),
        email: z.string(),
        name: z.string(),
      }),
    )
    .mutation(async ({ ctx }) => {
      const limited = await rateLimit(`sub:pro:${ctx.user.id}`, {
        limit: 5,
        windowMs: 60_000,
      });
      if (limited.limited) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests, please try again later",
        });
      }

      if (!razorpayConfigured()) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message:
            "Payments are not configured yet. Please contact support.",
        });
      }
      const planId = process.env.RAZORPAY_PRO_PLAN_ID;
      if (!planId) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "The Pro plan is not available yet. Please try again later.",
        });
      }

      const [row] = await db
        .select({
          plan: usersTable.plan,
          subscriptionId: usersTable.subscriptionId,
          subscriptionStatus: usersTable.subscriptionStatus,
          email: usersTable.email,
          name: usersTable.name,
        })
        .from(usersTable)
        .where(eq(usersTable.id, ctx.user.id))
        .limit(1)
        .execute();

      if (row?.subscriptionId) {
        return {
          subscriptionId: row.subscriptionId,
          keyId: razorpayConfig()!.keyId,
          email: row.email,
          name: row.name,
        };
      }

      const subscription = await createRazorpaySubscription({
        planId,
        email: row?.email ?? ctx.user.email,
        name: row?.name ?? ctx.user.name,
        notes: { userId: ctx.user.id },
      });

      await db
        .update(usersTable)
        .set({
          subscriptionId: subscription.id,
          subscriptionStatus: subscription.status ?? "created",
        })
        .where(eq(usersTable.id, ctx.user.id))
        .execute();

      return {
        subscriptionId: subscription.id,
        keyId: razorpayConfig()!.keyId,
        email: row?.email ?? ctx.user.email,
        name: row?.name ?? ctx.user.name,
      };
    }),

  /**
   * Called from the Checkout success handler. Verifies the first-payment
   * signature and upgrades the user to Pro immediately (the webhook is the
   * source of truth, this just removes the delay after checkout).
   */
  verifySubscriptionPayment: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/subscriptions/verify-payment",
        tags: TAGS,
      },
    })
    .input(
      z.object({
        subscriptionId: z.string(),
        paymentId: z.string(),
        signature: z.string(),
      }),
    )
    .output(z.object({ activated: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!verifyRazorpaySubscriptionSignature(input)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payment verification failed. Please try again.",
        });
      }

      const [row] = await db
        .select({
          id: usersTable.id,
          subscriptionId: usersTable.subscriptionId,
        })
        .from(usersTable)
        .where(eq(usersTable.id, ctx.user.id))
        .limit(1)
        .execute();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      if (row.subscriptionId && row.subscriptionId !== input.subscriptionId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Subscription does not match your account",
        });
      }

      const subscription = await fetchRazorpaySubscription(
        input.subscriptionId,
      ).catch(() => null);
      const paid = subscription
        ? isPaidStatus(subscription.status)
        : true;

      if (paid) {
        await db
          .update(usersTable)
          .set({
            plan: "pro",
            subscriptionId: input.subscriptionId,
            subscriptionStatus: "active",
            planUpdatedAt: new Date(),
          })
          .where(eq(usersTable.id, ctx.user.id))
          .execute();
      }

      return { activated: paid };
    }),

  /** Cancels the user's Razorpay subscription and downgrades to Free. */
  cancelSubscription: protectedProcedure
    .meta({
      openapi: { method: "POST", path: "/subscriptions/cancel", tags: TAGS },
    })
    .input(z.undefined())
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx }) => {
      const [row] = await db
        .select({ subscriptionId: usersTable.subscriptionId })
        .from(usersTable)
        .where(eq(usersTable.id, ctx.user.id))
        .limit(1)
        .execute();

      if (row?.subscriptionId) {
        await cancelRazorpaySubscription(row.subscriptionId).catch(() => {
          // cancellation can race with Razorpay's own "cancelled" webhook
        });
      }

      await db
        .update(usersTable)
        .set({
          plan: "free",
          subscriptionStatus: "cancelled",
          planUpdatedAt: new Date(),
        })
        .where(eq(usersTable.id, ctx.user.id))
        .execute();

      return { success: true };
    }),

  /** Edits basic profile details (name, company, job title). */
  updateProfile: protectedProcedure
    .meta({
      openapi: { method: "PATCH", path: "/profile", tags: TAGS },
    })
    .input(updateProfileInput)
    .output(
      z.object({
        name: z.string(),
        company: z.string().nullable(),
        jobTitle: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .update(usersTable)
        .set({
          name: input.name,
          company: input.company ?? null,
          jobTitle: input.jobTitle ?? null,
        })
        .where(eq(usersTable.id, ctx.user.id))
        .execute();

      return {
        name: input.name,
        company: input.company ?? null,
        jobTitle: input.jobTitle ?? null,
      };
    }),
});