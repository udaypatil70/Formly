import { and, count, eq, sql } from "drizzle-orm";

import { db } from "@repo/db";
import {
  PLAN_FEATURE_KEYS,
  formWebhooksTable,
  formsTable,
  plansTable,
  themesTable,
  usageCountersTable,
  usersTable,
  type PlanEntitlements,
  type PlanFeature,
  type PlanLimits,
  type SelectPlan,
} from "@repo/db/schema";
import { TRPCError } from "@trpc/server";

/**
 * Plan catalogue, entitlement checks and quota metering.
 *
 * The `plans` table is the single source of truth for pricing, feature flags and
 * numeric caps. Enforcement helpers here are the only place that reads it, so a
 * gate can never disagree with what the pricing page advertises.
 */

type PlanKey = SelectPlan["key"];

/**
 * Used when the catalogue row is missing (e.g. migrations not applied yet).
 * Fails toward the most restrictive plan so a missing row can never hand out
 * free Pro/Enterprise capabilities.
 */
const FALLBACK_ENTITLEMENTS: PlanEntitlements = {
  maxForms: 3,
  maxResponsesPerMonth: 100,
  maxThemes: 1,
  maxWebhooksPerForm: 1,
  multiPageAndLogic: false,
  analytics: false,
  emailNotifications: false,
  botProtection: true,
  csvExport: true,
  passwordAndExpiry: true,
  embed: false,
  customDomain: false,
  webhooks: false,
  payments: false,
  ssoSaml: false,
  prioritySupport: false,
  auditLogsAndSla: false,
};

const UNLIMITED_LIMITS: PlanLimits = {
  maxForms: null,
  maxResponsesPerMonth: null,
  maxThemes: null,
  maxWebhooksPerForm: null,
};

/** Every flag off, every cap unlimited: the shape of "nothing is gated". */
function allUnlimitedEntitlements(): PlanEntitlements {
  return {
    ...UNLIMITED_LIMITS,
    ...Object.fromEntries(PLAN_FEATURE_KEYS.map((key) => [key, true])),
  } as PlanEntitlements;
}

/**
 * Coerces whatever is in the jsonb column into a complete entitlement record.
 * Missing keys fall back to `false` (feature off) and `null` (unlimited), so a
 * partially edited catalogue row can never crash a request or silently widen
 * access.
 */
export function normalizeEntitlements(raw: unknown): PlanEntitlements {
  const source = (raw ?? {}) as Partial<PlanEntitlements>;
  const normalized = allUnlimitedEntitlements();

  for (const key of PLAN_FEATURE_KEYS) {
    normalized[key] = source[key] === true;
  }
  for (const key of Object.keys(UNLIMITED_LIMITS) as (keyof PlanLimits)[]) {
    const value = source[key];
    normalized[key] =
      typeof value === "number" && Number.isFinite(value) && value >= 0
        ? Math.floor(value)
        : null;
  }
  return normalized;
}

/** Active plan catalogue ordered for display. */
export async function getPlanCatalogue(): Promise<SelectPlan[]> {
  return db
    .select()
    .from(plansTable)
    .where(eq(plansTable.isActive, true))
    .orderBy(plansTable.sortOrder)
    .execute();
}

export async function getPlanByKey(
  key: PlanKey,
): Promise<SelectPlan | undefined> {
  const [row] = await db
    .select()
    .from(plansTable)
    .where(eq(plansTable.key, key))
    .limit(1)
    .execute();
  return row;
}

/** The caller's plan key, defaulting to `free` for unknown/blank values. */
export async function getUserPlanKey(userId: string): Promise<PlanKey> {
  const [row] = await db
    .select({ plan: usersTable.plan })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1)
    .execute();
  return row?.plan ?? "free";
}

export type UserEntitlements = {
  planKey: PlanKey;
  entitlements: PlanEntitlements;
};

/** Plan key + entitlement record for one user. */
export async function getUserEntitlements(
  userId: string,
): Promise<UserEntitlements> {
  const planKey = await getUserPlanKey(userId);
  const plan = await getPlanByKey(planKey);
  return {
    planKey,
    entitlements: plan
      ? normalizeEntitlements(plan.entitlements)
      : FALLBACK_ENTITLEMENTS,
  };
}

export function planAllowsFeature(
  entitlements: PlanEntitlements,
  feature: PlanFeature,
): boolean {
  return entitlements[feature] === true;
}

/** Conditional logic is only "on" when it carries at least one real rule. */
export function hasConditionalLogic(
  logic: Record<string, unknown> | null | undefined,
): boolean {
  if (!logic) return false;
  if (logic.showIf) return true;
  if (Array.isArray(logic.groups) && logic.groups.length > 0) return true;
  if (logic.gotoPageId) return true;
  return logic.gotoSubmit === true;
}

/** Anything other than the single-page default counts as a multi-page form. */
export function isMultiPage(
  stepMode: string | null | undefined,
): boolean {
  return Boolean(stepMode) && stepMode !== "all";
}

/** `YYYY-MM` billing period for the current month, in UTC. */
export function currentPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function upgradeRequired(message: string) {
  return new TRPCError({ code: "PAYMENT_REQUIRED", message });
}

// ─── Limit checks ──────────────────────────────────────────

/** Live counters for one owner, used both by the gate and the usage page. */
export async function getUsageSnapshot(userId: string) {
  const period = currentPeriod();
  const [forms, themes, webhooks, counter] = await Promise.all([
    db
      .select({ value: count() })
      .from(formsTable)
      .where(
        and(
          eq(formsTable.ownerId, userId),
          eq(formsTable.archived, false),
          eq(formsTable.isTemplate, false),
        ),
      )
      .execute(),
    db
      .select({ value: count() })
      .from(themesTable)
      .where(eq(themesTable.ownerId, userId))
      .execute(),
    db
      .select({ value: count() })
      .from(formWebhooksTable)
      .innerJoin(formsTable, eq(formWebhooksTable.formId, formsTable.id))
      .where(eq(formsTable.ownerId, userId))
      .execute(),
    db
      .select({ responses: usageCountersTable.responses })
      .from(usageCountersTable)
      .where(
        and(
          eq(usageCountersTable.ownerId, userId),
          eq(usageCountersTable.period, period),
        ),
      )
      .limit(1)
      .execute(),
  ]);

  return {
    period,
    forms: Number(forms[0]?.value ?? 0),
    themes: Number(themes[0]?.value ?? 0),
    webhooks: Number(webhooks[0]?.value ?? 0),
    responsesThisMonth: counter[0]?.responses ?? 0,
  };
}

function assertWithinLimit(
  used: number,
  max: number | null,
  label: string,
) {
  if (max !== null && used >= max) {
    throw upgradeRequired(
      `You have reached the ${max} ${label} included in your plan. Upgrade to add more.`,
    );
  }
}

export async function assertFormQuota(
  userId: string,
  entitlements: PlanEntitlements,
) {
  if (entitlements.maxForms === null) return;
  const [row] = await db
    .select({ value: count() })
    .from(formsTable)
    .where(
      and(
        eq(formsTable.ownerId, userId),
        eq(formsTable.archived, false),
        eq(formsTable.isTemplate, false),
      ),
    )
    .execute();
  assertWithinLimit(Number(row?.value ?? 0), entitlements.maxForms, "forms");
}

export async function assertThemeQuota(
  userId: string,
  entitlements: PlanEntitlements,
) {
  if (entitlements.maxThemes === null) return;
  const [row] = await db
    .select({ value: count() })
    .from(themesTable)
    .where(eq(themesTable.ownerId, userId))
    .execute();
  assertWithinLimit(Number(row?.value ?? 0), entitlements.maxThemes, "themes");
}

export async function assertWebhookQuota(
  formId: string,
  entitlements: PlanEntitlements,
) {
  if (entitlements.maxWebhooksPerForm === null) return;
  const [row] = await db
    .select({ value: count() })
    .from(formWebhooksTable)
    .where(eq(formWebhooksTable.formId, formId))
    .execute();
  assertWithinLimit(
    Number(row?.value ?? 0),
    entitlements.maxWebhooksPerForm,
    "webhooks per form",
  );
}

// ─── Response metering ─────────────────────────────────────

/**
 * Atomically counts one accepted submission against the owner's monthly quota.
 *
 * Runs inside the submit transaction so a rollback also rolls the counter back —
 * a failed submission never burns quota. Counting continues even on unlimited
 * plans so the usage page always has a live number to show.
 */
export async function consumeResponseQuota(
  tx: Pick<typeof db, "insert" | "update">,
  ownerId: string,
  entitlements: PlanEntitlements,
  period = currentPeriod(),
) {
  const [row] = await tx
    .insert(usageCountersTable)
    .values({ ownerId, period, responses: 1 })
    .onConflictDoUpdate({
      target: [usageCountersTable.ownerId, usageCountersTable.period],
      set: {
        responses: sql`${usageCountersTable.responses} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ responses: usageCountersTable.responses })
    .execute();

  const used = row?.responses ?? 1;
  const max = entitlements.maxResponsesPerMonth;
  if (max !== null && used > max) {
    // Give the slot back so the rejected submission is not counted, then fail.
    await tx
      .update(usageCountersTable)
      .set({ responses: sql`${usageCountersTable.responses} - 1` })
      .where(
        and(
          eq(usageCountersTable.ownerId, ownerId),
          eq(usageCountersTable.period, period),
        ),
      )
      .execute();
    throw upgradeRequired(
      `This form's owner has reached the ${max} responses included in their plan this month.`,
    );
  }
  return used;
}
