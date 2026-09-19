import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRightIcon,
  BarChart3Icon,
  Building2Icon,
  CheckIcon,
  Code2Icon,
  FileDownIcon,
  LayersIcon,
  LockKeyholeIcon,
  MailIcon,
  MousePointerClickIcon,
  PaletteIcon,
  PlusIcon,
  QrCodeIcon,
  RocketIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StarIcon,
  WorkflowIcon,
  ZapIcon,
} from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { SiteHeader } from "~/components/marketing/site-header";
import { SiteFooter } from "~/components/marketing/site-footer";

function useScrollToHash() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = hash.replace("#", "");
    const element = document.getElementById(id);
    if (element) {
      setTimeout(() => element.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, [hash]);
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Badge
        variant="outline"
        className="border-violet-500/30 bg-violet-500/10 px-3 py-1 text-violet-300"
      >
        {eyebrow}
      </Badge>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="text-muted-foreground mt-4 text-base leading-relaxed sm:text-lg">
          {description}
        </p>
      )}
    </div>
  );
}

const FEATURES = [
  {
    icon: MousePointerClickIcon,
    title: "Drag-and-drop builder",
    description:
      "Assemble multi-page forms in minutes with an intuitive canvas. Reorder fields, add options, and preview on any device.",
  },
  {
    icon: WorkflowIcon,
    title: "Conditional logic",
    description:
      "Show the right questions to the right people. Branch forms based on answers with powerful show-if rules.",
  },
  {
    icon: BarChart3Icon,
    title: "Real-time analytics",
    description:
      "Track views, completion rates, and drop-off points. Visualize every answer with charts that update live.",
  },
  {
    icon: PaletteIcon,
    title: "Branded themes",
    description:
      "Match your brand with curated themes, custom fonts, and color palettes. Make every form feel unmistakably yours.",
  },
  {
    icon: LockKeyholeIcon,
    title: "Access control",
    description:
      "Protect forms with passwords, expiry dates, and response limits. Keep submissions exactly where you want them.",
  },
  {
    icon: MailIcon,
    title: "Email notifications",
    description:
      "Get notified the moment a response lands, and send automatic confirmations back to your respondents.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Bot protection",
    description:
      "Cloudflare Turnstile and honeypot fields silently block spam while keeping the experience friction-less for real users.",
  },
  {
    icon: Code2Icon,
    title: "Open API",
    description:
      "Integrate with anything. Fetch forms, submit responses, and export data through a documented REST + tRPC API.",
  },
  {
    icon: FileDownIcon,
    title: "Export everything",
    description:
      "Pull responses as clean CSV in one click, or browse them in a filterable, searchable table.",
  },
];

const STEPS = [
  {
    number: "01",
    icon: LayersIcon,
    title: "Create",
    description:
      "Pick a title, add fields, and pick a theme. The builder saves every keystroke, so nothing is ever lost.",
  },
  {
    number: "02",
    icon: ZapIcon,
    title: "Share",
    description:
      "Publish with a custom slug, embed it on your site, or share via QR code. Password and expiry rules included.",
  },
  {
    number: "03",
    icon: BarChart3Icon,
    title: "Analyze",
    description:
      "Watch responses stream in with live analytics, export to CSV, and turn feedback into your next move.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "We replaced three tools with Formly. The analytics and export pipeline alone save our team hours every single week.",
    name: "Aarav Mehta",
    role: "Product Manager, SaaS",
    initials: "AM",
  },
  {
    quote:
      "The conditional logic is ridiculously easy. I built a 40-question onboarding flow in an afternoon — no code, no headaches.",
    name: "Sophia Bennett",
    role: "Operations Lead, Fintech",
    initials: "SB",
  },
  {
    quote:
      "Beautiful themes, bot protection, and a genuinely fast builder. Our response rate jumped 38% after switching.",
    name: "Daniel Okafor",
    role: "Founder, EdTech startup",
    initials: "DO",
  },
];

type Billing = "monthly" | "yearly";

const PRO_PRICES = { monthly: 10, yearly: 8 };

interface LandingTier {
  name: string;
  tagline: string;
  icon: typeof SparklesIcon;
  highlight?: boolean;
  price: number | null;
  cta: string;
  features: string[];
}

const LANDING_TIERS: Omit<LandingTier, "price">[] = [
  {
    name: "Free",
    tagline: "For side projects and first forms",
    icon: SparklesIcon,
    cta: "Start for free",
    features: [
      "3 active forms",
      "100 responses / month",
      "1 branded theme",
      "Password & expiry protection",
      "CSV export",
    ],
  },
  {
    name: "Pro",
    tagline: "For creators and growing teams",
    icon: RocketIcon,
    highlight: true,
    cta: "Start free trial",
    features: [
      "Unlimited forms & responses",
      "All 50+ branded themes",
      "Conditional logic & multi-page forms",
      "Real-time analytics dashboard",
      "Email notifications + webhooks",
      "Embed anywhere + custom slug",
    ],
  },
  {
    name: "Enterprise",
    tagline: "For organizations at scale",
    icon: Building2Icon,
    cta: "Contact sales",
    features: [
      "Everything in Pro",
      "SSO / SAML authentication",
      "Custom domain",
      "Audit logs & data retention",
      "Dedicated success manager",
    ],
  },
];

export function LandingPage() {
  useScrollToHash();
  const [billing, setBilling] = useState<Billing>("yearly");

  return (
    <div className="min-h-svh bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:44px_44px] pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
        <div className="bg-violet-600/20 pointer-events-none absolute -top-40 left-1/2 h-96 w-[52rem] -translate-x-1/2 rounded-full blur-3xl" />
        <div className="bg-fuchsia-500/10 pointer-events-none absolute -left-32 top-32 h-72 w-72 rounded-full blur-3xl" />

        <div className="relative mx-auto w-full max-w-7xl px-4 pb-16 pt-20 sm:px-6 sm:pt-24 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Badge
              variant="outline"
              className="border-border/60 bg-white/5 px-3 py-1 shadow-sm backdrop-blur"
            >
              <SparklesIcon className="text-violet-400" />
              Introducing Formly 2.0 — now with email notifications
            </Badge>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">
              Forms that look like you.{" "}
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">
                Built in minutes.
              </span>
            </h1>
            <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-base leading-relaxed sm:text-lg">
              Formly is the form builder for people who care about design. Drag,
              drop, branch, analyze — and ship a response-ready form before your
              coffee goes cold.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                className="h-11 bg-violet-600 px-6 text-[15px] text-white shadow-lg shadow-violet-600/30 hover:bg-violet-500"
              >
                <Link to="/login">
                  Start building free
                  <ArrowRightIcon />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 border-border/60 bg-white/5 px-6 text-[15px] backdrop-blur hover:bg-white/10"
              >
                <Link to="/docs">
                  <Code2Icon />
                  Read the docs
                </Link>
              </Button>
            </div>
            <p className="text-muted-foreground mt-5 text-sm">
              No credit card required · Free forever plan · Cancel anytime
            </p>
          </div>

          {/* Product mockup */}
          <div className="relative mx-auto mt-16 max-w-6xl">
            <div className="from-violet-500/15 to-fuchsia-500/5 absolute inset-x-8 -top-8 h-24 rounded-full bg-gradient-to-r blur-2xl" />
            <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-[#1c1c22]/90 shadow-2xl shadow-black/50 backdrop-blur">
              <div className="flex items-center gap-2 border-b border-border/60 bg-white/[0.03] px-4 py-3">
                <span className="size-2.5 rounded-full bg-red-500/80" />
                <span className="size-2.5 rounded-full bg-amber-500/80" />
                <span className="size-2.5 rounded-full bg-emerald-500/80" />
                <span className="text-muted-foreground ml-3 flex items-center gap-1.5 text-xs">
                  <LockKeyholeIcon className="size-3" />
                  formly.app/f/feedback
                </span>
              </div>

              <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[0.95fr_1.15fr_0.9fr]">
                {/* Form fields */}
                <div className="flex flex-col rounded-xl border border-border/60 bg-white/[0.02]">
                  <div className="text-muted-foreground flex items-center justify-between border-b border-border/60 px-4 py-2.5 text-xs font-medium">
                    Form fields
                    <span className="bg-violet-500/10 text-violet-400 rounded-full border border-violet-500/20 px-2 py-0.5 text-[10px]">
                      5
                    </span>
                  </div>
                  <div className="space-y-1.5 p-3">
                    {[
                      { n: "1", name: "Full Name", type: "Short text" },
                      { n: "2", name: "Email address", type: "Email" },
                      { n: "3", name: "Overall rating", type: "Rating" },
                      { n: "4", name: "How did you hear?", type: "Single select" },
                      { n: "5", name: "Your message", type: "Long text" },
                    ].map((field) => (
                      <div
                        key={field.n}
                        className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-white/[0.03] px-2.5 py-1.5"
                      >
                        <span className="bg-white/[0.05] text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded text-[10px]">
                          {field.n}
                        </span>
                        <span className="flex-1 truncate text-xs font-medium">
                          {field.name}
                        </span>
                        <span className="text-muted-foreground shrink-0 rounded-full border border-border/60 bg-white/[0.03] px-2 py-0.5 text-[10px]">
                          {field.type}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 pt-0">
                    <div className="text-muted-foreground flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 py-1.5 text-xs transition-colors hover:border-violet-500/40 hover:text-violet-400">
                      <PlusIcon className="size-3.5" />
                      Add field
                    </div>
                  </div>
                </div>

                {/* Live preview */}
                <div className="flex flex-col rounded-xl border border-border/60 bg-white/[0.02]">
                  <div className="text-muted-foreground border-b border-border/60 px-4 py-2.5 text-xs font-medium">
                    Live preview
                  </div>
                  <div className="flex-1 space-y-3.5 p-4 sm:p-5">
                    <div>
                      <div className="text-sm font-semibold">Product Feedback</div>
                      <div className="text-muted-foreground text-xs">
                        Share your experience with our product
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium">Full Name</div>
                      <div className="h-8 rounded-lg border border-border/60 bg-white/[0.04] px-3 text-xs leading-8">
                        Sarah Chen
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium">Email Address</div>
                      <div className="h-8 rounded-lg border border-border/60 bg-white/[0.04] px-3 text-xs leading-8">
                        sarah@example.com
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Overall Rating</span>
                        <span className="text-foreground/40 text-[10px]">Required</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <span
                            key={index}
                            className={
                              index < 4
                                ? "text-amber-400 [&>svg]:size-4"
                                : "text-foreground/20 [&>svg]:size-4"
                            }
                          >
                            <StarIcon fill="currentColor" />
                          </span>
                        ))}
                        <span className="text-foreground/50 ml-1 text-xs">
                          4/5
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium">
                        How did you hear about us?
                      </div>
                      <div className="space-y-1.5">
                        {[
                          { label: "Twitter / X", selected: true },
                          { label: "Google Search", selected: false },
                          { label: "A friend", selected: false },
                          { label: "Product Hunt", selected: false },
                        ].map((option) => (
                          <div
                            key={option.label}
                            className={cn(
                              "flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs",
                              option.selected
                                ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
                                : "border-border/60 text-muted-foreground",
                            )}
                          >
                            {option.label}
                            {option.selected && <CheckIcon className="size-3.5" />}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-violet-600 flex h-8 items-center justify-center rounded-lg text-xs font-medium text-white shadow-lg shadow-violet-600/25">
                      Submit response
                    </div>
                  </div>
                </div>

                {/* Responses */}
                <div className="flex flex-col rounded-xl border border-border/60 bg-white/[0.02]">
                  <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 text-xs font-medium">
                    <span className="text-muted-foreground">Responses</span>
                    <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                      <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                      Live
                    </span>
                  </div>
                  <div className="flex-1 p-4 sm:p-5">
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-2xl font-semibold">127</div>
                        <div className="text-muted-foreground text-xs">
                          Total responses
                        </div>
                      </div>
                      <span className="text-emerald-400 text-xs font-medium">
                        +12 today
                      </span>
                    </div>
                    <div className="mt-3 flex h-12 items-end gap-1">
                      {[6, 9, 5, 11, 8, 10, 12].map((height, index) => (
                        <span
                          key={index}
                          className="flex-1 rounded-sm bg-violet-500/40"
                          style={{ height: `${height * 3}px` }}
                        />
                      ))}
                    </div>
                    <div className="text-muted-foreground mt-1 text-[10px]">
                      Last 7 days
                    </div>
                    <div className="mt-4 space-y-2">
                      {[
                        { initials: "S", name: "Sarah C.", time: "just now", className: "bg-violet-500/20 text-violet-300" },
                        { initials: "J", name: "James R.", time: "3m ago", className: "bg-amber-500/20 text-amber-300" },
                        { initials: "P", name: "Priya N.", time: "8m ago", className: "bg-emerald-500/20 text-emerald-300" },
                      ].map((person) => (
                        <div key={person.name} className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              "flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                              person.className,
                            )}
                          >
                            {person.initials}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium">
                              {person.name}
                            </div>
                            <div className="text-muted-foreground text-[10px]">
                              {person.time}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-white/[0.03] py-1.5 text-xs">
                        <FileDownIcon className="size-3.5" />
                        Export CSV
                      </div>
                      <div className="flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-white/[0.03] py-1.5 text-xs">
                        <QrCodeIcon className="size-3.5" />
                        Share QR
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border/60 bg-white/[0.02]">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-8 px-4 py-10 text-center sm:px-6 lg:grid-cols-4 lg:px-8">
          {[
            { value: "10k+", label: "Responses collected" },
            { value: "50+", label: "Curated themes" },
            { value: "99.9%", label: "Uptime" },
            { value: "4.9/5", label: "Creator rating" },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-3xl font-semibold text-transparent sm:text-4xl">
                {stat.value}
              </div>
              <div className="text-muted-foreground mt-1 text-sm">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20">
        <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <SectionHeading
            eyebrow="Features"
            title={
              <>
                Everything you need to{" "}
                <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                  collect better answers
                </span>
              </>
            }
            description="From a pixel-perfect builder to production-ready APIs, Formly gives your forms superpowers without the complexity."
          />
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card
                key={feature.title}
                className="group border-border/60 bg-white/[0.02] p-6 shadow-none transition-all hover:-translate-y-0.5 hover:border-violet-500/30 hover:bg-white/[0.04]"
              >
                <span className="bg-violet-500/10 flex size-11 items-center justify-center rounded-xl border border-violet-500/20 text-violet-400 transition-transform group-hover:scale-105 [&>svg]:size-5">
                  <feature.icon />
                </span>
                <h3 className="mt-4 text-base font-semibold">{feature.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-border/60 bg-white/[0.02] scroll-mt-20">
        <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <SectionHeading
            eyebrow="How it works"
            title={
              <>
                From blank canvas to insights in{" "}
                <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                  three steps
                </span>
              </>
            }
          />
          <div className="relative mt-14 grid gap-8 md:grid-cols-3">
            <div className="from-violet-500/20 to-transparent absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r md:block" />
            {STEPS.map((step) => (
              <div key={step.number} className="relative">
                <span className="relative z-10 flex size-14 items-center justify-center rounded-2xl border border-violet-500/30 bg-background text-lg font-semibold text-violet-400 shadow-lg shadow-violet-500/10">
                  {step.number}
                </span>
                <step.icon className="mt-5 size-5 text-violet-400" />
                <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="scroll-mt-20">
        <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <SectionHeading
            eyebrow="Testimonials"
            title={
              <>
                Loved by teams who{" "}
                <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                  ship on Fridays
                </span>
              </>
            }
          />
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((testimonial) => (
              <Card
                key={testimonial.name}
                className="border-border/60 bg-white/[0.02] p-6 shadow-none"
              >
                <div className="text-amber-400 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <StarIcon key={index} className="size-4" fill="currentColor" />
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed">
                  &ldquo;{testimonial.quote}&rdquo;
                </p>
                <div className="mt-5 flex items-center gap-3 border-t border-border/60 pt-4">
                  <span className="bg-violet-500/20 flex size-10 items-center justify-center rounded-full text-sm font-semibold text-violet-300">
                    {testimonial.initials}
                  </span>
                  <div>
                    <div className="text-sm font-medium">{testimonial.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {testimonial.role}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-border/60 bg-white/[0.02] scroll-mt-20">
        <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <SectionHeading
            eyebrow="Pricing"
            title={
              <>
                Start free.{" "}
                <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                  Scale when you&apos;re ready.
                </span>
              </>
            }
            description="Every plan includes unlimited viewers, bot protection, and exports. No credit card required."
          />

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
                    −20%
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {LANDING_TIERS.map((tier) => {
              const price = tier.name === "Pro" ? PRO_PRICES[billing] : null;
              return (
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
                      {price === null ? "Custom" : `$${price}`}
                    </span>
                    {price !== null && (
                      <span className="text-muted-foreground text-sm">
                        / month
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-1 h-4 text-xs">
                    {tier.name === "Pro" && billing === "yearly"
                      ? "billed annually"
                      : tier.name === "Free"
                        ? "free forever"
                        : price === null
                          ? "tailored to your team"
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
                    <Link to="/login">
                      {tier.cta}
                      <ArrowRightIcon />
                    </Link>
                  </Button>
                  <ul className="mt-7 space-y-3">
                    {tier.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2.5 text-sm"
                      >
                        <CheckIcon className="text-emerald-400 mt-0.5 size-4 shrink-0" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>

          <p className="text-muted-foreground mt-10 text-center text-sm">
            Need the full breakdown?{" "}
            <Link
              to="/pricing"
              className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
            >
              Compare every feature →
            </Link>
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/60 bg-white/[0.02]">
        <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-violet-500/25 bg-gradient-to-br from-violet-950/60 via-fuchsia-950/40 to-[#18181b] px-6 py-16 text-center sm:px-16">
            <div className="bg-violet-600/25 pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full blur-3xl" />
            <div className="relative">
              <RocketIcon className="mx-auto size-10 text-violet-400" />
              <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                Ready to build your next form?
              </h2>
              <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-base">
                Join thousands of creators collecting beautiful, useful answers.
                Set up takes less than a minute.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  asChild
                  className="h-11 bg-violet-600 px-6 text-[15px] text-white shadow-lg shadow-violet-600/30 hover:bg-violet-500"
                >
                  <Link to="/login">
                    Create your free account
                    <ArrowRightIcon />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-11 border-border/60 bg-white/5 px-6 text-[15px] backdrop-blur hover:bg-white/10"
                >
                  <Link to="/pricing">Compare plans</Link>
                </Button>
              </div>
              <div className="text-muted-foreground mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
                <span className="flex items-center gap-1.5">
                  <CheckIcon className="size-4 text-emerald-400" /> Free forever plan
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckIcon className="size-4 text-emerald-400" /> No credit card
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckIcon className="size-4 text-emerald-400" /> Unlimited forms
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}