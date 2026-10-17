import { z } from "zod";

import { PLAN_FEATURE_KEYS } from "@repo/db/schema";

import { router, publicProcedure } from "../../trpc";
import {
  getPlanCatalogue,
  getUserPlanKey,
  normalizeEntitlements,
} from "../../utils/plans";

const TAGS = ["Plans"];

const planOutput = z.object({
  key: z.enum(["free", "pro", "enterprise"]),
  name: z.string(),
  tagline: z.string().nullable(),
  priceMonthly: z.number().int().nullable(),
  priceYearlyPerMonth: z.number().int().nullable(),
  currency: z.string(),
  features: z.array(z.string()),
  entitlements: z.record(z.string(), z.union([z.boolean(), z.number().nullable()])),
  sortOrder: z.number().int(),
});

export const planRouter = router({
  /**
   * Public plan catalogue. The pricing and landing pages render from this so
   * prices, limits and feature flags can only ever be changed in one place.
   */
  list: publicProcedure
    .meta({ openapi: { method: "GET", path: "/plans", tags: TAGS } })
    .input(z.undefined())
    .output(
      z.object({
        plans: z.array(planOutput),
        features: z.array(z.string()),
        currentPlan: z.enum(["free", "pro", "enterprise"]).nullable(),
      }),
    )
    .query(async ({ ctx }) => {
      const rows = await getPlanCatalogue();

      return {
        plans: rows.map((row) => ({
          key: row.key,
          name: row.name,
          tagline: row.tagline ?? null,
          priceMonthly: row.priceMonthly,
          priceYearlyPerMonth: row.priceYearlyPerMonth,
          currency: row.currency,
          features: row.features ?? [],
          entitlements: normalizeEntitlements(row.entitlements),
          sortOrder: row.sortOrder,
        })),
        features: [...PLAN_FEATURE_KEYS],
        currentPlan: ctx.user ? await getUserPlanKey(ctx.user.id) : null,
      };
    }),
});
