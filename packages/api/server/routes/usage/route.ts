import { z } from "zod";

import { PLAN_FEATURE_KEYS } from "@repo/db/schema";

import { router, protectedProcedure } from "../../trpc";
import { getUsageSnapshot, getUserEntitlements } from "../../utils/plans";

const TAGS = ["Usage"];

export const usageRouter = router({
  /**
   * Current billing-period usage for the signed-in owner, plus the caps and
   * feature flags their plan grants. Backs the usage meter and decides which
   * upgrade prompts the dashboard shows.
   */
  getMyUsage: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/usage/me", tags: TAGS } })
    .input(z.undefined())
    .output(
      z.object({
        period: z.string(),
        plan: z.enum(["free", "pro", "enterprise"]),
        usage: z.object({
          forms: z.number().int(),
          themes: z.number().int(),
          webhooks: z.number().int(),
          responsesThisMonth: z.number().int(),
        }),
        limits: z.object({
          maxForms: z.number().int().nullable(),
          maxResponsesPerMonth: z.number().int().nullable(),
          maxThemes: z.number().int().nullable(),
          maxWebhooksPerForm: z.number().int().nullable(),
        }),
        exceeded: z.object({
          forms: z.boolean(),
          responsesThisMonth: z.boolean(),
          themes: z.boolean(),
        }),
        features: z.record(z.string(), z.boolean()),
      }),
    )
    .query(async ({ ctx }) => {
      const [{ planKey, entitlements }, usage] = await Promise.all([
        getUserEntitlements(ctx.user.id),
        getUsageSnapshot(ctx.user.id),
      ]);

      const exceeded = (used: number, max: number | null) =>
        max !== null && used >= max;

      return {
        period: usage.period,
        plan: planKey,
        usage: {
          forms: usage.forms,
          themes: usage.themes,
          webhooks: usage.webhooks,
          responsesThisMonth: usage.responsesThisMonth,
        },
        limits: {
          maxForms: entitlements.maxForms,
          maxResponsesPerMonth: entitlements.maxResponsesPerMonth,
          maxThemes: entitlements.maxThemes,
          maxWebhooksPerForm: entitlements.maxWebhooksPerForm,
        },
        exceeded: {
          forms: exceeded(usage.forms, entitlements.maxForms),
          responsesThisMonth: exceeded(
            usage.responsesThisMonth,
            entitlements.maxResponsesPerMonth,
          ),
          themes: exceeded(usage.themes, entitlements.maxThemes),
        },
        features: Object.fromEntries(
          PLAN_FEATURE_KEYS.map((key) => [key, entitlements[key]]),
        ),
      };
    }),
});
