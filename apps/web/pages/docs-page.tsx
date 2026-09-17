import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckIcon, CopyIcon, ExternalLinkIcon, KeyRoundIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { getApiOrigin } from "~/lib/api-origin";
import { cn } from "~/lib/utils";
import { SiteHeader } from "~/components/marketing/site-header";
import { SiteFooter } from "~/components/marketing/site-footer";

const API = typeof window !== "undefined" ? getApiOrigin() : "http://localhost:8000";

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/60 bg-[#141417]/90">
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="text-muted-foreground hover:text-foreground absolute right-3 top-3 flex size-7 items-center justify-center rounded-md opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
        aria-label="Copy code"
      >
        {copied ? <CheckIcon className="size-4 text-emerald-400" /> : <CopyIcon className="size-4" />}
      </button>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-zinc-300">
        <code>{children}</code>
      </pre>
    </div>
  );
}

interface Endpoint {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  description: string;
  auth?: boolean;
  sample?: string;
}

const METHOD_STYLES: Record<Endpoint["method"], string> = {
  GET: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  POST: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  PATCH: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
};

function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  return (
    <div className="rounded-xl border border-border/60 bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 text-xs font-semibold",
            METHOD_STYLES[endpoint.method],
          )}
        >
          {endpoint.method}
        </span>
        <code className="font-mono text-[13px] text-foreground">{endpoint.path}</code>
        {endpoint.auth && (
          <Badge className="ml-auto bg-white/[0.05] text-muted-foreground">auth required</Badge>
        )}
      </div>
      <p className="text-muted-foreground mt-2 text-sm">{endpoint.description}</p>
      {endpoint.sample && (
        <div className="mt-4">
          <CodeBlock>{endpoint.sample}</CodeBlock>
        </div>
      )}
    </div>
  );
}

const SIDEBAR = [
  { id: "introduction", label: "Introduction" },
  { id: "authentication", label: "Authentication" },
  { id: "public-endpoints", label: "Public endpoints" },
  { id: "forms", label: "Forms" },
  { id: "responses", label: "Responses" },
  { id: "analytics", label: "Analytics" },
  { id: "rate-limits", label: "Rate limits" },
  { id: "api-reference", label: "API reference" },
];

export function DocsPage() {
  return (
    <div className="min-h-svh bg-background">
      <SiteHeader />

      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
          {/* Sidebar */}
          <aside className="lg:sticky lg:top-24 lg:h-fit">
            <p className="text-muted-foreground mb-3 px-3 text-xs font-semibold uppercase tracking-wider">
              API Reference
            </p>
            <nav className="flex gap-1 overflow-x-auto lg:flex-col">
              {SIDEBAR.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="text-muted-foreground hover:text-foreground hover:bg-accent shrink-0 rounded-md px-3 py-2 text-sm transition-colors"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <div className="min-w-0 max-w-3xl space-y-14">
            <div>
              <Badge
                variant="outline"
                className="border-violet-500/30 bg-violet-500/10 px-3 py-1 text-violet-300"
              >
                <KeyRoundIcon />
                API Docs
              </Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                Build on top of Formforge
              </h1>
              <p className="text-muted-foreground mt-4 text-base leading-relaxed">
                Formforge exposes a fully typed API for fetching forms, submitting
                responses, and managing everything you collect. Every route below is
                also available as an interactive reference and an OpenAPI
                specification.
              </p>
            </div>

            <section id="introduction" className="scroll-mt-24 space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight">Introduction</h2>
              <p className="text-muted-foreground leading-relaxed">
                The REST endpoints are generated from our tRPC router, so request and
                response shapes are always in sync. Point your HTTP client at the base
                URL and you&apos;re ready to go.
              </p>
              <CodeBlock>{`BASE_URL = ${API}`.replace(/\n$/, "")}</CodeBlock>
              <p className="text-muted-foreground leading-relaxed">
                Prefix all REST routes with <code className="text-foreground font-mono text-[13px]">/api</code>.
                Prefer TypeScript? Use the tRPC client at{" "}
                <code className="text-foreground font-mono text-[13px]">/trpc</code> for end-to-end
                type safety.
              </p>
              <CodeBlock>{`// REST (OpenAPI)
${API}/api/public/forms/{slug}

// tRPC (typed)
${API}/trpc/health.health`}</CodeBlock>
            </section>

            <section id="authentication" className="scroll-mt-24 space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight">Authentication</h2>
              <p className="text-muted-foreground leading-relaxed">
                Formforge uses cookie-based sessions. Sign in once, and subsequent
                requests carry your session automatically — no tokens to manage.
              </p>
              <CodeBlock>{`// Sign in
const res = await fetch("${API}/auth/sign-in/email", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ email: "you@example.com", password: "..." }),
});

// Check the session
const session = await fetch("${API}/auth/session", {
  credentials: "include",
}).then((r) => r.json());`}</CodeBlock>
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  Sign-up:{" "}
                  <code className="text-foreground font-mono text-[13px]">POST {API}/auth/sign-up/email</code>
                </p>
                <p className="text-muted-foreground">
                  Sign-out:{" "}
                  <code className="text-foreground font-mono text-[13px]">POST {API}/auth/sign-out</code>
                </p>
              </div>
            </section>

            <section id="public-endpoints" className="scroll-mt-24 space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight">Public endpoints</h2>
              <p className="text-muted-foreground leading-relaxed">
                These routes power the public form renderer and need no
                authentication — great for embeds and custom frontends.
              </p>
              <div className="space-y-3">
                <EndpointCard
                  endpoint={{
                    method: "GET",
                    path: "/public/forms/{slug}",
                    description:
                      "Fetch a published form by slug, including fields, theme, and settings.",
                  }}
                />
                <EndpointCard
                  endpoint={{
                    method: "POST",
                    path: "/public/forms/{slug}/responses",
                    description:
                      "Submit a response. Answers are validated against the form's live schema.",
                    sample: `POST ${API}/api/public/forms/my-slug/responses
Content-Type: application/json

{
  "honeypot": "",
  "completedInSeconds": 84,
  "answers": {
    "f9306a69-1f6c-4d72-9e2a-6d9a2d8f7c31": "Ada Lovelace",
    "b3c9c1f2-8a73-4e6b-bc0e-77d1a2f0c55c": "5"
  }
}

→ 200 { "success": true, "responseId": "..." }`,
                  }}
                />
                <EndpointCard
                  endpoint={{
                    method: "GET",
                    path: "/explore/forms",
                    description:
                      "Browse public forms with pagination, search, and category filters.",
                  }}
                />
              </div>
            </section>

            <section id="forms" className="scroll-mt-24 space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight">Forms</h2>
              <p className="text-muted-foreground leading-relaxed">
                Manage your own forms and their metadata. All routes in this section
                require an authenticated session.
              </p>
              <div className="space-y-3">
                <EndpointCard
                  endpoint={{
                    method: "GET",
                    path: "/forms",
                    description: "List your forms with live response and view counts.",
                    auth: true,
                  }}
                />
                <EndpointCard
                  endpoint={{
                    method: "POST",
                    path: "/forms",
                    description: "Create a form, optionally with its fields.",
                    auth: true,
                    sample: `POST ${API}/api/forms
Content-Type: application/json

{
  "title": "Customer feedback",
  "slug": "customer-feedback",
  "visibility": "public",
  "fields": [
    {
      "type": "email",
      "label": "Email",
      "required": true,
      "order": 0
    }
  ]
}`,
                  }}
                />
                <EndpointCard
                  endpoint={{
                    method: "GET",
                    path: "/forms/{id}",
                    description: "Get a form with all its fields and theme.",
                    auth: true,
                  }}
                />
                <EndpointCard
                  endpoint={{
                    method: "PATCH",
                    path: "/forms/{id}",
                    description: "Update title, slug, settings, visibility, or theme.",
                    auth: true,
                  }}
                />
                <EndpointCard
                  endpoint={{
                    method: "POST",
                    path: "/forms/{id}/publish",
                    description: "Publish a form so it accepts responses.",
                    auth: true,
                  }}
                />
                <EndpointCard
                  endpoint={{
                    method: "DELETE",
                    path: "/forms/{id}",
                    description: "Permanently delete a form and its data.",
                    auth: true,
                  }}
                />
              </div>
            </section>

            <section id="responses" className="scroll-mt-24 space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight">Responses</h2>
              <div className="space-y-3">
                <EndpointCard
                  endpoint={{
                    method: "GET",
                    path: "/responses",
                    description:
                      "List responses for a form with pagination, date range, and text search.",
                    auth: true,
                  }}
                />
                <EndpointCard
                  endpoint={{
                    method: "GET",
                    path: "/responses/csv",
                    description: "Export all responses for a form as CSV.",
                    auth: true,
                  }}
                />
                <EndpointCard
                  endpoint={{
                    method: "DELETE",
                    path: "/responses/{id}",
                    description: "Delete a single response.",
                    auth: true,
                  }}
                />
              </div>
            </section>

            <section id="analytics" className="scroll-mt-24 space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight">Analytics</h2>
              <div className="space-y-3">
                <EndpointCard
                  endpoint={{
                    method: "GET",
                    path: "/analytics/{formId}",
                    description:
                      "Views, responses, completion rate, drop-off, and per-field breakdowns.",
                    auth: true,
                  }}
                />
                <EndpointCard
                  endpoint={{
                    method: "GET",
                    path: "/themes",
                    description: "List available themes (also POST / PATCH / DELETE for custom themes).",
                    auth: true,
                  }}
                />
              </div>
            </section>

            <section id="rate-limits" className="scroll-mt-24 space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight">Rate limits</h2>
              <p className="text-muted-foreground leading-relaxed">
                Public endpoints are rate-limited per IP to keep forms fast and safe.
                When a limit is hit we return HTTP{" "}
                <code className="text-foreground font-mono text-[13px]">429</code> with a
                usable message.
              </p>
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-white/[0.02] text-left">
                      <th className="px-4 py-3 font-semibold">Action</th>
                      <th className="px-4 py-3 font-semibold">Limit</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b border-border/40">
                      <td className="px-4 py-3">Form views</td>
                      <td className="px-4 py-3">30 / minute</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3">Response submissions</td>
                      <td className="px-4 py-3">5 / minute</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section id="api-reference" className="scroll-mt-24 space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight">Interactive reference</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <a
                  href={`${API}/docs`}
                  target="_blank"
                  rel="noreferrer"
                  className="group border-border/60 bg-white/[0.02] flex flex-col items-start gap-3 rounded-xl border p-5 transition-colors hover:border-violet-500/30"
                >
                  <span className="from-violet-500 to-fuchsia-500 flex size-10 items-center justify-center rounded-lg bg-gradient-to-br text-white [&>svg]:size-5">
                    <ExternalLinkIcon />
                  </span>
                  <div>
                    <div className="font-semibold">Scalar API reference</div>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Full interactive playground with try-it requests.
                    </p>
                  </div>
                </a>
                <a
                  href={`${API}/openapi.json`}
                  target="_blank"
                  rel="noreferrer"
                  className="group border-border/60 bg-white/[0.02] flex flex-col items-start gap-3 rounded-xl border p-5 transition-colors hover:border-violet-500/30"
                >
                  <span className="from-violet-500 to-fuchsia-500 flex size-10 items-center justify-center rounded-lg bg-gradient-to-br text-white [&>svg]:size-5">
                    <ExternalLinkIcon />
                  </span>
                  <div>
                    <div className="font-semibold">OpenAPI specification</div>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Generated openapi.json for codegen and tooling.
                    </p>
                  </div>
                </a>
              </div>
              <p className="text-muted-foreground pt-2 text-sm">
                Questions?{" "}
                <Link to="/pricing" className="text-violet-400 hover:underline">
                  Check our plans
                </Link>{" "}
                or{" "}
                <Link to="/login" className="text-violet-400 hover:underline">
                  create an account
                </Link>{" "}
                to try the API yourself.
              </p>
            </section>
          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}