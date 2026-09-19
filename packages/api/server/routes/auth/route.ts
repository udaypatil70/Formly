import { z, zodUndefinedModel } from "../../schema";
import { auth } from "@repo/services/auth";
import { publicProcedure, protectedProcedure, router } from "../../trpc";
import { getUserRole } from "../../utils/admin";

const TAGS = ["Authentication"];

type PlanOutput = "free" | "pro" | "enterprise";

/** Normalize the (string-typed) better-auth field into the plan enum. */
function normalizePlan(plan: string | null | undefined): PlanOutput {
  if (plan === "pro") return "pro";
  if (plan === "enterprise") return "enterprise";
  return "free";
}

export const authRouter = router({
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
              image: user.image ?? null,
              role: getUserRole(user.email),
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
});