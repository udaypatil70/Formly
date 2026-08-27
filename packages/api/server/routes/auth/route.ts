import { z, zodUndefinedModel } from "../../schema";
import { auth } from "@repo/services/auth";
import { publicProcedure, protectedProcedure, router } from "../../trpc";

const TAGS = ["Authentication"];

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