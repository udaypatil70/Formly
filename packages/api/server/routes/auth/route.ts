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
      return {
        user: ctx.user
          ? {
              id: ctx.user.id,
              name: ctx.user.name,
              email: ctx.user.email,
              image: ctx.user.image ?? null,
            }
          : null,
        session: ctx.session
          ? {
              id: ctx.session.id,
              expiresAt: ctx.session.expiresAt.toISOString(),
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
        headers: new Headers(),
        session: ctx.session,
      });
      return { success: true };
    }),
});
