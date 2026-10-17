import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { userPlanEnum, usersTable } from "./user";

/**
 * Boolean capability flags a plan grants. Kept in sync with the feature
 * comparison matrix rendered by the pricing page.
 */
export const PLAN_FEATURE_KEYS = [
  "multiPageAndLogic",
  "analytics",
  "emailNotifications",
  "botProtection",
  "csvExport",
  "passwordAndExpiry",
  "embed",
  "customDomain",
  "webhooks",
  "payments",
  "ssoSaml",
  "prioritySupport",
  "auditLogsAndSla",
] as const;

export type PlanFeature = (typeof PLAN_FEATURE_KEYS)[number];

export const PLAN_FEATURE_LABELS: Record<PlanFeature, string> = {
  multiPageAndLogic: "Multi-page forms and conditional logic",
  analytics: "Real-time analytics",
  emailNotifications: "Email notifications",
  botProtection: "Bot protection",
  csvExport: "CSV export",
  passwordAndExpiry: "Password and expiry protection",
  embed: "Embedding",
  customDomain: "Custom domains",
  webhooks: "Webhooks",
  payments: "Payment fields",
  ssoSaml: "SSO / SAML",
  prioritySupport: "Priority support",
  auditLogsAndSla: "Audit logs and uptime SLA",
};

/**
 * Numeric caps a plan grants. `null` means unlimited. Stored as a single jsonb
 * document so limits and feature flags travel together and are validated by one
 * parser instead of a dozen columns.
 */
export type PlanLimits = {
  maxForms: number | null;
  maxResponsesPerMonth: number | null;
  maxThemes: number | null;
  maxWebhooksPerForm: number | null;
};

export type PlanEntitlements = PlanLimits & Record<PlanFeature, boolean>;

/**
 * Editable plan catalogue. `key` reuses the `user_plan` enum so a plan row and
 * `users.plan` can never drift apart.
 */
export const plansTable = pgTable("plans", {
  key: userPlanEnum("key").primaryKey(),

  name: varchar("name", { length: 80 }).notNull(),
  tagline: varchar("tagline", { length: 255 }),

  /** Prices in the currency's minor unit (e.g. cents). `null` = contact sales. */
  priceMonthly: integer("price_monthly"),
  priceYearlyPerMonth: integer("price_yearly_per_month"),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),

  /** Marketing bullets shown on the pricing page. */
  features: jsonb("features")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  entitlements: jsonb("entitlements").$type<PlanEntitlements>().notNull(),

  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
});

/**
 * Per-owner monthly counters. One row per (owner, YYYY-MM) kept up to date with
 * an atomic upsert so quota checks never need a COUNT(*) over the responses
 * table on the public submit path.
 */
export const usageCountersTable = pgTable(
  "usage_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    ownerId: uuid("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    /** Billing period in `YYYY-MM` form. */
    period: varchar("period", { length: 7 }).notNull(),
    responses: integer("responses").notNull().default(0),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("usage_counters_owner_id_period_unique").on(
      table.ownerId,
      table.period,
    ),
  ],
);

export type SelectPlan = typeof plansTable.$inferSelect;
export type InsertPlan = typeof plansTable.$inferInsert;
export type SelectUsageCounter = typeof usageCountersTable.$inferSelect;
export type InsertUsageCounter = typeof usageCountersTable.$inferInsert;
