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
import {
  isEndedStatus,
  isPaidStatus,
  reconcileUserSubscription,
} from "../../utils/subscriptions";

const TAGS = ["Subscriptions"];

const subscriptionOutput = z.object({
  plan: z.enum(["free", "pro", "enterprise"]),
  subscriptionId: z.string().nullable(),
  subscriptionStatus: z.string().nullable(),
  company: z.string().nullable(),
  jobTitle: z.string().nullable(),
  planUpdatedAt: z.string().nullable(),
  subscriptionSyncedAt: z.string().nullable(),
  razorpayConfigured: z.boolean(),
  proPlanConfigured: z.boolean(),
});

const updateProfileInput = z.object({
  name: z.string().min(1).max(80),
  company: z.string().trim().max(120).nullable().optional(),
  jobTitle: z.string().trim().max(120).nullable().optional(),
});

type SubscriptionView = z.infer<typeof subscriptionOutput>;

async function readSubscriptionView(userId: string): Promise<SubscriptionView> {
  const [row] = await db
    .select({
      plan: usersTable.plan,
      subscriptionId: usersTable.subscriptionId,
      subscriptionStatus: usersTable.subscriptionStatus,
      company: usersTable.company,
      jobTitle: usersTable.jobTitle,
      planUpdatedAt: usersTable.planUpdatedAt,
      subscriptionSyncedAt: usersTable.subscriptionSyncedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1)
    .execute();

  return {
    plan: row?.plan ?? "free",
    subscriptionId: row?.subscriptionId ?? null,
    subscriptionStatus: row?.subscriptionStatus ?? null,
    company: row?.company ?? null,
    jobTitle: row?.jobTitle ?? null,
    planUpdatedAt: row?.planUpdatedAt?.toISOString() ?? null,
    subscriptionSyncedAt: row?.subscriptionSyncedAt?.toISOString() ?? null,
    razorpayConfigured: razorpayConfigured(),
    proPlanConfigured: Boolean(process.env.RAZORPAY_PRO_PLAN_ID),
  };
}

export const subscriptionRouter = router({
  /**
   * Current plan + subscription state for the signed-in user.
   *
   * When the persisted state is older than the staleness window, Razorpay is
   * consulted first. This repairs a missed webhook the next time the user
   * opens their profile instead of leaving them stuck on the wrong plan.
   */
  getMySubscription: protectedProcedure
    .meta({
      openapi: { method: "GET", path: "/subscriptions/me", tags: TAGS },
    })
    .input(z.object({ refresh: z.boolean().optional() }).optional())
    .output(subscriptionOutput)
    .query(async ({ ctx, input }) => {
      await reconcileUserSubscription(ctx.user.id, {
        force: input?.refresh ?? false,
      });
      return readSubscriptionView(ctx.user.id);
    }),

  /**
   * Force a Razorpay state check. Used by the profile's "Sync now" button and
   * safe to call repeatedly — it only writes when the provider disagrees.
   */
  syncSubscription: protectedProcedure
    .meta({
      openapi: { method: "POST", path: "/subscriptions/sync", tags: TAGS },
    })
    .input(z.undefined())
    .output(subscriptionOutput)
    .mutation(async ({ ctx }) => {
      const limited = await rateLimit(`sub:sync:${ctx.user.id}`, {
        limit: 10,
        windowMs: 60_000,
      });
      if (limited.limited) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many sync requests, please try again shortly.",
        });
      }

      await reconcileUserSubscription(ctx.user.id, { force: true });
      return readSubscriptionView(ctx.user.id);
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

      // Re-use a live subscription, but never hand Checkout a subscription
      // Razorpay has already ended (cancelled/completed/halted).
      if (row?.subscriptionId && !isEndedStatus(row.subscriptionStatus)) {
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
          subscriptionSyncedAt: new Date(),
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
    .output(
      z.object({
        activated: z.boolean(),
        subscriptionStatus: z.string().nullable(),
      }),
    )
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

      // Fail closed: if Razorpay cannot be reached, the client must not be
      // upgraded on the strength of an unverified claim. The webhook (or a
      // later reconciliation) is the source of truth.
      const subscription = await fetchRazorpaySubscription(
        input.subscriptionId,
      ).catch(() => null);
      const paid = subscription
        ? isPaidStatus(subscription.status)
        : false;

      await db
        .update(usersTable)
        .set({
          subscriptionId: input.subscriptionId,
          subscriptionSyncedAt: new Date(),
          ...(subscription?.status
            ? { subscriptionStatus: subscription.status }
            : {}),
          ...(paid
            ? {
                plan: "pro" as const,
                subscriptionStatus: "active",
                planUpdatedAt: new Date(),
              }
            : {}),
        })
        .where(eq(usersTable.id, ctx.user.id))
        .execute();

      return {
        activated: paid,
        subscriptionStatus: subscription?.status ?? null,
      };
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
          subscriptionSyncedAt: new Date(),
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