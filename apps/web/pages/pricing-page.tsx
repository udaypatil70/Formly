import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRightIcon,
  CheckIcon,
  MinusIcon,
  SparklesIcon,
  Building2Icon,
  RocketIcon,
  HelpCircleIcon,
} from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { cn } from "~/lib/utils";
import { SiteHeader } from "~/components/marketing/site-header";
import { SiteFooter } from "~/components/marketing/site-footer";

type Billing = "monthly" | "yearly";

const PRICES = {
  free: { monthly: 0, yearly: 0 },
  pro: { monthly: 12, yearly: 9 },
  enterprise: { monthly: null, yearly: null },
};

interface Tier {
  name: string;
  tagline: string;
  icon: typeof RocketIcon;
  highlight?: boolean;
  priceLabel: string;
  cta: string;
  ctaHref: string;
  features: string[];
}

const FREE_TIER: Tier = {
  name: "Free",
  tagline: "For side projects and first forms",
  icon: SparklesIcon,
  priceLabel: "$0",
  cta: "Start for free",
  ctaHref: "/login",
  features: [
    "3 active forms",
    "100 responses / month",
    "1 branded theme",
    "Password & expiry protection",
    "CSV export",
    "Bot protection",
  ],
};

function proTier(billing: Billing): Tier {
  return {
    name: "Pro",
    tagline: "For creators and growing teams",
    icon: RocketIcon,
    highlight: true,
    priceLabel: `$${PRICES.pro[billing]}`,
    cta: "Start free trial",
    ctaHref: "/login",
    features: [
      "Unlimited forms & responses",
      "All 50+ branded themes",
      "Conditional logic & multi-page forms",
      "Real-time analytics dashboard",
      "Email notifications",
      "Embed anywhere + custom slug",
      "Priority support",
    ],
  };
}

const ENTERPRISE_TIER: Tier = {
  name: "Enterprise",
  tagline: "For organizations at scale",
  icon: Building2Icon,
  priceLabel: "Custom",
  cta: "Contact sales",
  ctaHref: "/login",
  features: [
    "Everything in Pro",
    "SSO / SAML authentication",
    "Custom domain",
    "Audit logs & data retention",
    "Dedicated success manager",
    "99.9% uptime SLA",
  ],
};

interface ComparisonRow {
  label: string;
  values: (string | boolean)[];
}

const COMPARISON_ROWS: ComparisonRow[] = [
  { label: "Active forms", values: ["3", "Unlimited", "Unlimited"] },
  { label: "Responses per month", values: ["100", "Unlimited", "Unlimited"] },
  { label: "Branded themes", values: ["1", "50+", "50+"] },
  { label: "Multi-page & conditional logic", values: [false, true, true] },
  { label: "Analytics dashboard", values: [false, true, true] },
  { label: "Email notifications", values: [false, true, true] },
  { label: "Bot protection (Turnstile)", values: [true, true, true] },
  { label: "CSV export", values: [true, true, true] },
  { label: "Password & expiry protection", values: [true, true, true] },
  { label: "Embed anywhere", values: [false, true, true] },
  { label: "Custom domain", values: [false, false, true] },
  { label: "SSO / SAML", values: [false, false, true] },
  { label: "Priority support", values: [false, true, true] },
  { label: "Uptime SLA + audit logs", values: [false, false, true] },
];

const FAQS = [
  {
    question: "Can I switch plans later?",
    answer:
      "Absolutely. You can upgrade, downgrade, or cancel at any time from your dashboard. Changes are prorated automatically, so you only pay for what you use.",
  },
  {
    question: "What happens when I hit the free limits?",
    answer:
      "Your forms keep working. We'll simply pause new responses once you pass the monthly cap and nudge you to upgrade — nothing is ever deleted.",
  },
  {
    question: "Do you offer student or non-profit discounts?",
    answer:
      "Yes — we offer a 40% discount on Pro for students, educators, and registered non-profits. Reach out from support and we'll get you set up.",
  },
  {
    question: "How does billing work?",
    answer:
      "You're billed per month (or per year with 25% off). All paid plans include a 14-day free trial — no credit card required to get started.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Data is encrypted in transit and at rest, responses are stored with hashed IPs, and optional password/expiry controls keep access tight.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Anytime, in two clicks, with no lock-in. You keep access to your data and can export everything instantly — even after canceling.",
  },
];

export function PricingPage() {
  const [billing, setBilling] = useState<Billing>("yearly");
  const tiers = [FREE_TIER, proTier(billing), ENTERPRISE_TIER];

  return (
    <div className="min-h-svh bg-background">
      <SiteHeader />

      <section className="relative overflow-hidden">
        <div className="bg-violet-600/15 pointer-events-none absolute -top-32 left-1/2 h-72 w-[44rem] -translate-x-1/2 rounded-full blur-3xl" />
        <div className="relative mx-auto w-full max-w-7xl px-4 pb-8 pt-16 text-center sm:px-6 sm:pt-20 lg:px-8">
          <Badge
            variant="outline"
            className="border-violet-500/30 bg-violet-500/10 px-3 py-1 text-violet-300"
          >
            <SparklesIcon />
            Simple, transparent pricing
          </Badge>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
            Pick a plan that{" "}
            <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              grows with you
            </span>
          </h1>
          <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-base sm:text-lg">
            Start free. Upgrade when your forms take off. Every paid plan ships with
            unlimited everything and a 14-day trial.
          </p>

          <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-border/60 bg-white/[0.03] p-1">
            {(["monthly", "yearly"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setBilling(option)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  billing === option
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option === "monthly" ? "Monthly" : "Yearly"}
                {option === "yearly" && (
                  <span
                    className={cn(
                      "ml-1.5 text-xs",
                      billing === option ? "text-white/80" : "text-emerald-400",
                    )}
                  >
                    −25%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Tiers */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {tiers.map((tier) => (
            <Card
              key={tier.name}
              className={cn(
                "relative flex flex-col p-6",
                tier.highlight
                  ? "border-violet-500/40 bg-gradient-to-b from-violet-950/40 to-white/[0.02] shadow-xl shadow-violet-500/10"
                  : "border-border/60 bg-white/[0.02]",
              )}
            >
              {tier.highlight && (
                <Badge className="bg-violet-600 text-white shadow-lg shadow-violet-600/30">
                  Most popular
                </Badge>
              )}
              <span
                className={cn(
                  "mt-4 flex size-11 items-center justify-center rounded-xl border [&>svg]:size-5",
                  tier.highlight
                    ? "border-violet-500/30 bg-violet-500/15 text-violet-300"
                    : "border-border/60 bg-white/[0.04] text-muted-foreground",
                )}
              >
                <tier.icon />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{tier.name}</h3>
              <p className="text-muted-foreground text-sm">{tier.tagline}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight">
                  {tier.priceLabel}
                </span>
                {tier.priceLabel !== "Custom" && (
                  <span className="text-muted-foreground text-sm">
                    / month
                  </span>
                )}
              </div>
              <p className="text-muted-foreground mt-1 h-4 text-xs">
                {billing === "yearly" && tier.priceLabel !== "Custom" && tier.priceLabel !== "$0"
                  ? "billed annually"
                  : tier.priceLabel === "$0"
                    ? "free forever"
                    : ""}
              </p>
              <Button
                asChild
                className={cn(
                  "mt-6 w-full",
                  tier.highlight
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25 hover:bg-violet-500"
                    : tier.name === "Enterprise"
                      ? "bg-white text-zinc-900 hover:bg-white/90"
                      : "border-border/60 bg-white/5 backdrop-blur hover:bg-white/10",
                )}
              >
                <Link to={tier.ctaHref}>
                  {tier.cta}
                  <ArrowRightIcon />
                </Link>
              </Button>
              <ul className="mt-7 space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <CheckIcon className="text-emerald-400 mt-0.5 size-4 shrink-0" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section className="border-t border-border/60 bg-white/[0.02]">
        <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Compare every feature
            </h2>
            <p className="text-muted-foreground mt-4 text-base sm:text-lg">
              No fine print, no surprises. Here&apos;s exactly what each plan includes.
            </p>
          </div>

          <div className="mt-12 overflow-x-auto rounded-2xl border border-border/60 bg-white/[0.02]">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="px-6 py-4 text-left font-semibold">Features</th>
                  {["Free", "Pro", "Enterprise"].map((name) => (
                    <th
                      key={name}
                      className={cn(
                        "px-6 py-4 text-center text-base font-semibold",
                        name === "Pro" && "text-violet-300",
                      )}
                    >
                      {name}
                      {name === "Pro" && (
                        <div className="text-muted-foreground mt-0.5 text-xs font-normal">
                          $9/mo billed yearly
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, index) => (
                  <tr
                    key={row.label}
                    className={cn(
                      "border-b border-border/40 last:border-0",
                      index % 2 === 0 && "bg-white/[0.015]",
                    )}
                  >
                    <td className="px-6 py-3.5 text-muted-foreground">
                      {row.label}
                    </td>
                    {row.values.map((value, column) => (
                      <td key={column} className="px-6 py-3.5 text-center">
                        {typeof value === "boolean" ? (
                          value ? (
                            <CheckIcon className="text-emerald-400 mx-auto size-4.5" />
                          ) : (
                            <MinusIcon className="text-muted-foreground/40 mx-auto size-4.5" />
                          )
                        ) : (
                          <span className="font-medium">{value}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto w-full max-w-4xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Badge
            variant="outline"
            className="border-violet-500/30 bg-violet-500/10 px-3 py-1 text-violet-300"
          >
            <HelpCircleIcon />
            FAQ
          </Badge>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Questions, answered
          </h2>
        </div>
        <Accordion type="single" collapsible className="mt-10">
          {FAQS.map((faq, index) => (
            <AccordionItem
              key={faq.question}
              value={`item-${index}`}
              className="border-border/60 bg-white/[0.02] px-5"
            >
              <AccordionTrigger className="text-left text-[15px] font-medium">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* CTA */}
      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-6 rounded-3xl border border-violet-500/25 bg-gradient-to-r from-violet-950/50 to-[#18181b] px-8 py-12 text-center sm:flex-row sm:text-left">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Start collecting better answers today
            </h2>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">
              Free forever plan. No credit card. Set up in under a minute.
            </p>
          </div>
          <Button
            asChild
            className="bg-violet-600 px-6 text-white shadow-lg shadow-violet-600/30 hover:bg-violet-500"
          >
            <Link to="/login">
              Create your free account
              <ArrowRightIcon />
            </Link>
          </Button>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}