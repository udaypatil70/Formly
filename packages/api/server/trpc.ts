import { initTRPC, TRPCError } from "@trpc/server";
import { OpenApiMeta } from "trpc-to-openapi";

import { createContext } from "./context";
import { isAdminEmail } from "./utils/admin";

export const tRPCContext = initTRPC
  .meta<OpenApiMeta>()
  .context<typeof createContext>()
  .create({});

export const router = tRPCContext.router;

export const publicProcedure = tRPCContext.procedure;

const enforceAuth = tRPCContext.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this resource",
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      session: ctx.session,
    },
  });
});

export const protectedProcedure = tRPCContext.procedure.use(enforceAuth);

const enforceAdmin = tRPCContext.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this resource",
    });
  }
  if (!isAdminEmail(ctx.user.email)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have admin access",
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      session: ctx.session,
    },
  });
});

/** For admin-only procedures. Rejects non-admin users before the handler runs. */
export const adminProcedure = tRPCContext.procedure.use(enforceAdmin);
