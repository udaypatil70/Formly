import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { APIError } from "better-auth/api";
import { and, db, desc, eq } from "@repo/db";
import { accountsTable, sessionsTable } from "@repo/db/schema";
import { auth, authFeatures } from "@repo/services/auth";
import { env, parseOrigins } from "@repo/services/env";

import { z, zodUndefinedModel } from "../../schema";
import { publicProcedure, protectedProcedure, router } from "../../trpc";
import { getUserRole } from "../../utils/admin";
import { rateLimit } from "../../utils/rate-limit";
import { cancelRazorpaySubscription, razorpayConfigured } from "../../utils/razorpay";
import { isEndedStatus } from "../../utils/subscriptions";

const TAGS = ["Authentication"];

const frontendUrl = parseOrigins(env.FRONTEND_URL)[0] ?? "http://localhost:3000";

const hashKey = (value: string) =>
  createHash("sha256").update(`formly-auth:${value}`).digest("hex");

async function assertNotLimited(key: string, limit: number, message: string): Promise<void> {
  const result = await rateLimit(key, { limit, windowMs: 15 * 60_000 });
  if (result.limited) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message });
  }
}

type PlanOutput = "free" | "pro" | "enterprise";

/** Normalize the (string-typed) better-auth field into the plan enum. */
function normalizePlan(plan: string | null | undefined): PlanOutput {
  if (plan === "pro") return "pro";
  if (plan === "enterprise") return "enterprise";
  return "free";
}

export const authRouter = router({
  /** Feature flags that let the client hide flows the server cannot serve. */
  getConfig: publicProcedure
    .meta({ openapi: { method: "GET", path: "/auth/config", tags: TAGS } })
    .input(zodUndefinedModel)
    .output(
      z.object({
        emailVerificationEnabled: z.boolean(),
        forgotPasswordEnabled: z.boolean(),
        requireEmailVerification: z.boolean(),
      }),
    )
    .query(() => authFeatures),

  getSession: publicProcedure
    .meta({ openapi: { method: "GET", path: "/auth/session", tags: TAGS } })
    .input(zodUndefinedModel)
    .output(
      z.object({
        user: z
          .object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
            emailVerified: z.boolean(),
            image: z.string().nullable().optional(),
            role: z.enum(["admin", "user"]),
            plan: z.enum(["free", "pro", "enterprise"]).default("free"),
            subscriptionStatus: z.string().nullable().optional(),
            company: z.string().nullable().optional(),
            jobTitle: z.string().nullable().optional(),
          })
          .nullable(),
        session: z
          .object({
            id: z.string(),
            expiresAt: z.string(),
          })
          .nullable(),
      }),
    )
    .query(async ({ ctx }) => {
      const session = ctx.session?.session ?? null;
      const user = ctx.user;
      return {
        user: user
          ? {
              id: user.id,
              name: user.name,
              email: user.email,
              emailVerified: user.emailVerified,
              image: user.image ?? null,
              role: getUserRole(user),
              plan: normalizePlan(user.plan),
              subscriptionStatus: user.subscriptionStatus ?? null,
              company: user.company ?? null,
              jobTitle: user.jobTitle ?? null,
            }
          : null,
        session: session
          ? {
              id: session.id,
              expiresAt: session.expiresAt.toISOString(),
            }
          : null,
      };
    }),

  signOut: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/auth/sign-out", tags: TAGS } })
    .input(zodUndefinedModel)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx }) => {
      await auth.api.signOut({
        headers: ctx.headers,
      });
      return { success: true };
    }),

  /** Re-send the verification link to the signed-in user's email. */
  sendVerificationEmail: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/auth/verification-email",
        tags: TAGS,
      },
    })
    .input(zodUndefinedModel)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx }) => {
      if (!authFeatures.emailVerificationEnabled) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Email verification is not available on this server.",
        });
      }

      if (ctx.user.emailVerified) {
        return { success: true };
      }

      await assertNotLimited(
        `auth:verify:${ctx.user.id}`,
        5,
        "Too many verification emails, please try again later.",
      );

      try {
        await auth.api.sendVerificationEmail({
          body: {
            email: ctx.user.email,
            callbackURL: `${frontendUrl}/login?verified=1`,
          },
          headers: ctx.headers,
        });
      } catch (error) {
        if (error instanceof APIError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error.body?.message ?? "Couldn't send the verification email. Please try again.",
          });
        }
        throw error;
      }

      return { success: true };
    }),

  /**
   * Starts the password reset flow. The response is intentionally the same
   * whether or not the email belongs to an account.
   */
  requestPasswordReset: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/auth/forgot-password",
        tags: TAGS,
      },
    })
    .input(
      z.object({
        email: z.string().trim().email().max(255),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!authFeatures.forgotPasswordEnabled) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Password reset is not available on this server.",
        });
      }

      const email = input.email.toLowerCase();
      await assertNotLimited(
        `auth:forgot:ip:${hashKey(ctx.ip ?? "unknown")}`,
        10,
        "Too many password reset requests, please try again later.",
      );
      await assertNotLimited(
        `auth:forgot:email:${hashKey(email)}`,
        5,
        "Too many password reset requests, please try again later.",
      );

      try {
        await auth.api.requestPasswordReset({
          body: {
            email,
            redirectTo: `${frontendUrl}/reset-password`,
          },
          headers: ctx.headers,
        });
      } catch (error) {
        if (error instanceof APIError) {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: "Password reset is temporarily unavailable. Please try again.",
          });
        }
        throw error;
      }

      return { success: true };
    }),

  /** Completes the password reset using the token from the emailed link. */
  resetPassword: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/auth/reset-password",
        tags: TAGS,
      },
    })
    .input(
      z.object({
        token: z.string().min(1).max(512),
        newPassword: z.string().min(8).max(128),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!authFeatures.forgotPasswordEnabled) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Password reset is not available on this server.",
        });
      }

      await assertNotLimited(
        `auth:reset:ip:${hashKey(ctx.ip ?? "unknown")}`,
        10,
        "Too many reset attempts, please try again later.",
      );
      await assertNotLimited(
        `auth:reset:token:${hashKey(input.token)}`,
        10,
        "Too many reset attempts, please try again later.",
      );

      try {
        await auth.api.resetPassword({
          body: {
            token: input.token,
            newPassword: input.newPassword,
          },
          headers: ctx.headers,
        });
      } catch (error) {
        if (error instanceof APIError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error.body?.message ??
              "This reset link is invalid or has expired. Please request a new one.",
          });
        }
        throw error;
      }

      return { success: true };
    }),

  /** Active sessions for the current user, without exposing session tokens. */
  listSessions: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/auth/sessions", tags: TAGS } })
    .input(zodUndefinedModel)
    .output(
      z.array(
        z.object({
          id: z.string(),
          createdAt: z.string(),
          updatedAt: z.string(),
          expiresAt: z.string(),
          ipAddress: z.string().nullable(),
          userAgent: z.string().nullable(),
          current: z.boolean(),
        }),
      ),
    )
    .query(async ({ ctx }) => {
      const rows = await db
        .select({
          id: sessionsTable.id,
          createdAt: sessionsTable.createdAt,
          updatedAt: sessionsTable.updatedAt,
          expiresAt: sessionsTable.expiresAt,
          ipAddress: sessionsTable.ipAddress,
          userAgent: sessionsTable.userAgent,
        })
        .from(sessionsTable)
        .where(eq(sessionsTable.userId, ctx.user.id))
        .orderBy(desc(sessionsTable.updatedAt))
        .execute();

      const now = Date.now();
      const currentId = ctx.session?.session?.id;

      return rows
        .filter((row) => row.expiresAt.getTime() > now)
        .map((row) => ({
          id: row.id,
          createdAt: (row.createdAt ?? row.expiresAt).toISOString(),
          updatedAt: (row.updatedAt ?? row.createdAt ?? row.expiresAt).toISOString(),
          expiresAt: row.expiresAt.toISOString(),
          ipAddress: row.ipAddress ?? null,
          userAgent: row.userAgent ?? null,
          current: row.id === currentId,
        }));
    }),

  /** Revoke one of the current user's sessions by id. */
  revokeSession: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/auth/sessions/{sessionId}/revoke",
        tags: TAGS,
      },
    })
    .input(z.object({ sessionId: z.string().min(1).max(255) }))
    .output(z.object({ success: z.boolean(), signedOut: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await db
        .select({ token: sessionsTable.token })
        .from(sessionsTable)
        .where(and(eq(sessionsTable.id, input.sessionId), eq(sessionsTable.userId, ctx.user.id)))
        .limit(1)
        .execute();

      if (!target) {
        return { success: true, signedOut: false };
      }

      await auth.api.revokeSession({
        body: { token: target.token },
        headers: ctx.headers,
      });

      return {
        success: true,
        signedOut: input.sessionId === ctx.session?.session?.id,
      };
    }),

  /** Sign out every session except the one making this request. */
  revokeOtherSessions: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/auth/sessions/revoke-others",
        tags: TAGS,
      },
    })
    .input(zodUndefinedModel)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx }) => {
      await auth.api.revokeOtherSessions({ headers: ctx.headers });
      return { success: true };
    }),

  /**
   * Permanently delete the signed-in user's account. Active paid
   * subscriptions are cancelled first so deleting an account cannot leave a
   * live charge behind.
   */
  deleteAccount: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/auth/delete-account",
        tags: TAGS,
      },
    })
    .input(
      z.object({
        password: z.string().min(1).max(128).optional(),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertNotLimited(
        `auth:delete:${ctx.user.id}`,
        5,
        "Too many delete attempts, please try again later.",
      );

      const [credential] = await db
        .select({ id: accountsTable.id })
        .from(accountsTable)
        .where(
          and(eq(accountsTable.userId, ctx.user.id), eq(accountsTable.providerId, "credential")),
        )
        .limit(1)
        .execute();

      if (credential && !input.password) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Enter your password to delete your account.",
        });
      }

      // Verify the password before touching the subscription: a wrong password
      // must not cancel billing for an account that is going to survive.
      if (credential) {
        try {
          await auth.api.verifyPassword({
            body: { password: input.password! },
            headers: ctx.headers,
          });
        } catch (error) {
          if (error instanceof APIError) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Incorrect password. Your account was not deleted.",
            });
          }
          throw error;
        }
      }

      if (
        ctx.user.subscriptionId &&
        !isEndedStatus(ctx.user.subscriptionStatus) &&
        razorpayConfigured()
      ) {
        try {
          await cancelRazorpaySubscription(ctx.user.subscriptionId);
        } catch {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message:
              "We couldn't cancel your subscription. Please try again before deleting your account.",
          });
        }
      }

      try {
        await auth.api.deleteUser({
          body: credential ? { password: input.password } : {},
          headers: ctx.headers,
        });
      } catch (error) {
        if (error instanceof APIError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error.body?.message ??
              "Couldn't delete your account. Please sign in again and retry.",
          });
        }
        throw error;
      }

      return { success: true };
    }),
});
