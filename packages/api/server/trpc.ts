import { createHmac } from "node:crypto";
import { initTRPC, TRPCError } from "@trpc/server";
import { OpenApiMeta } from "trpc-to-openapi";
import { auditLogsTable, PLAN_FEATURE_LABELS, type PlanFeature } from "@repo/db/schema";
import { db } from "@repo/db";

import { createContext } from "./context";
import { isAdminUser } from "./utils/admin";
import { getUserEntitlements, planAllowsFeature } from "./utils/plans";
import { env } from "@repo/services/env";

export const tRPCContext = initTRPC
  .meta<OpenApiMeta>()
  .context<typeof createContext>()
  .create({});

export const router = tRPCContext.router;

export const publicProcedure = tRPCContext.procedure;

const auditMutation = tRPCContext.middleware(
  async ({ ctx, input, next, path, type }) => {
    const result = await next();
    if (type !== "mutation" || !ctx.user || ctx.user.plan !== "enterprise") {
      return result;
    }

    const inputRecord =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const resourceId = ["id", "formId", "responseId"].reduce<string | null>(
      (found, key) =>
        found ??
        (typeof inputRecord[key] === "string" ? inputRecord[key] : null),
      null,
    );
    const ip = ctx.ip;
    const ipHash = ip
      ? createHmac("sha256", env.BETTER_AUTH_SECRET).update(ip).digest("hex")
      : null;

    await db
      .insert(auditLogsTable)
      .values({
        ownerId: ctx.user.id,
        actorId: ctx.user.id,
        action: path,
        resourceType: path.split(".")[0] ?? "unknown",
        resourceId,
        metadata: { inputKeys: Object.keys(inputRecord) },
        ipHash,
        userAgent: ctx.headers.get("user-agent"),
      })
      .execute();
    return result;
  },
);

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

export const protectedProcedure = tRPCContext.procedure
  .use(enforceAuth)
  .use(auditMutation);

/**
 * Rejects the request unless the caller's plan grants `feature`.
 *
 * The resolved entitlements are forwarded on `ctx.entitlements` so a handler
 * that mixes a gated action with an ungated one does not have to look them up
 * twice. Admin-gated procedures deliberately do not use this: operators need to
 * reach any feature to moderate a tenant that has it.
 */
export function requiresFeature(feature: PlanFeature) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    const { planKey, entitlements } = await getUserEntitlements(ctx.user.id);
    if (!planAllowsFeature(entitlements, feature)) {
      throw new TRPCError({
        code: "PAYMENT_REQUIRED",
        message: `${PLAN_FEATURE_LABELS[feature]} is not included in your plan.`,
      });
    }
    return next({ ctx: { ...ctx, user: ctx.user, session: ctx.session, planKey, entitlements } });
  });
}

const enforceAdmin = tRPCContext.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this resource",
    });
  }
  if (!isAdminUser(ctx.user)) {
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
