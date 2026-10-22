import { useMemo } from "react";
import {
  Building2Icon,
  RocketIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react";

import { trpc } from "~/trpc/client";

export type Billing = "monthly" | "yearly";

export type PlanKey = "free" | "pro" | "enterprise";

type Entitlements = Record<string, boolean | number | null>;

/**
 * Purely presentational per-tier chrome. Everything a customer is actually
 * charged or allowed — price, limits, feature flags, bullet copy — comes from
 * the `plans` table via `GET /api/plans`, so the two pages can never drift from
 * what the server enforces.
 */
const PRESENTATION: Record<
  PlanKey,
  { icon: LucideIcon; highlight: boolean; cta: string }
> = {
  free: { icon: SparklesIcon, highlight: false, cta: "Start for free" },
  pro: { icon: RocketIcon, highlight: true, cta: "Start free trial" },
  enterprise: { icon: Building2Icon, highlight: false, cta: "Contact sales" },
};

export const TIER_ORDER: PlanKey[] = ["free", "pro", "enterprise"];

/** Rows of the feature comparison table: label + which entitlement drives it. */
const COMPARISON_ROWS: { label: string; key: string }[] = [
  { label: "Active forms", key: "maxForms" },
  { label: "Responses per month", key: "maxResponsesPerMonth" },
  { label: "Branded themes", key: "maxThemes" },
  { label: "Multi-page & conditional logic", key: "multiPageAndLogic" },
  { label: "Analytics dashboard", key: "analytics" },
  { label: "Email notifications", key: "emailNotifications" },
  { label: "Bot protection (Turnstile)", key: "botProtection" },
  { label: "CSV export", key: "csvExport" },
  { label: "Password & expiry protection", key: "passwordAndExpiry" },
  { label: "Embed anywhere", key: "embed" },
  { label: "Custom domain", key: "customDomain" },
  { label: "SSO / SAML", key: "ssoSaml" },
  { label: "90-day audit log retention", key: "auditLogsAndSla" },
];

export type PlanView = {
  key: PlanKey;
  name: string;
  tagline: string | null;
  /** Pre-formatted for display, e.g. `$10`, `$0` or `Custom`. */
  priceLabel: string;
  features: string[];
  entitlements: Entitlements;
  icon: LucideIcon;
  highlight: boolean;
  cta: string;
};

export type ComparisonRow = {
  label: string;
  values: (string | boolean)[];
};

/** Formats a minor-unit amount (e.g. 1000 cents) for display. */
export function formatPrice(amount: number | null, currency: string): string {
  if (amount === null) return "Custom";
  const value = amount / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function cell(entitlements: Entitlements, key: string): string | boolean {
  const value = entitlements[key];
  if (value === null || value === undefined) return "Unlimited";
  if (typeof value === "boolean") return value;
  return String(value);
}

/**
 * Loads the plan catalogue and maps it into the shapes the marketing pages
 * render. Returns `null` while loading or on error so callers can hold back
 * their pricing section instead of flashing empty numbers.
 */
export function usePlanCatalogue(billing: Billing) {
  const query = trpc.plan.list.useQuery();
  const { data } = query;

  const mapped = useMemo(() => {
    if (!data) return null;

    const byKey = new Map<string, (typeof data.plans)[number]>();
    for (const plan of data.plans) byKey.set(plan.key, plan);

    const plans: PlanView[] = TIER_ORDER.flatMap((key) => {
      const plan = byKey.get(key);
      const chrome = PRESENTATION[key];
      if (!plan) return [];

      const minor =
        billing === "yearly" ? plan.priceYearlyPerMonth : plan.priceMonthly;
      return [
        {
          key,
          name: plan.name,
          tagline: plan.tagline,
          priceLabel: formatPrice(minor, plan.currency),
          features: plan.features,
          entitlements: plan.entitlements as Entitlements,
          icon: chrome.icon,
          highlight: chrome.highlight,
          cta: chrome.cta,
        },
      ];
    });

    const comparisonRows: ComparisonRow[] = COMPARISON_ROWS.map((row) => ({
      label: row.label,
      values: plans.map((plan) => cell(plan.entitlements, row.key)),
    }));

    return {
      plans,
      comparisonRows,
      currentPlan: data.currentPlan as PlanKey | null,
    };
  }, [data, billing]);

  return {
    plans: mapped?.plans ?? [],
    comparisonRows: mapped?.comparisonRows ?? [],
    currentPlan: mapped?.currentPlan ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/** Short caption under the price, e.g. "billed annually" / "free forever". */
export function billingCaption(
  plan: PlanView,
  billing: Billing,
): string {
  if (plan.key === "free") return "free forever";
  if (plan.priceLabel === "Custom") return "tailored to your team";
  if (billing === "yearly") return "billed annually";
  return "";
}
