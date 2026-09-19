# Formly

**Build beautiful forms in minutes. Collect answers. Analyze responses. Repeat.**

Formly is a production-ready, full-featured form builder platform. It pairs a drag-and-drop form builder with a server-side form rendering engine, payments, subscription billing, real-time analytics, embeddable forms, templates, and an admin panel — packaged as a pnpm + Turborepo monorepo.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Configuration Reference](#configuration-reference)
- [Available Scripts](#available-scripts)
- [Webhooks](#webhooks)
- [Deployment](#deployment)
  - [Option A: Render + Vercel (recommended)](#option-a-render--vercel-recommended)
  - [Option B: All on Render](#option-b-all-on-render)
- [Project Structure](#project-structure)
- [License](#license)

---

## Overview

Formly lets anyone build, publish, and manage forms with advanced features typically reserved for paid SaaS products:

- A visual **form builder** with 15+ field types and conditional logic
- **Payment collection** through Razorpay, including recurring **Pro subscriptions**
- **Real-time response analytics** and an exportable ledger
- **Embedding** via link, QR code, iframe, or a standalone `<script>` embed
- **Webhook delivery** and **email notifications**
- **Custom domains**, dark mode, templates, and a role-gated admin panel

Everything runs through the same codebase — no external form services required.

## Features

| Area | Details |
|---|---|
| **Form builder** | Drag-and-drop layout (dnd-kit), 15+ field types, page modes (single-page / one-question-at-a-time / page breaks), start & end screens, section jumps, conditional logic groups |
| **Payments** | Razorpay payment field with server-side order creation, signed checkout, signature verification, and webhook reconciliation |
| **Subscriptions** | Recurring Razorpay Pro plans — profile-page upgrade flow, cancellation, plan status badges, admin visibility |
| **Responses** | Real-time response ledger with analytics views and export |
| **Automation** | Per-form webhooks (signed with HMAC), SMTP email notifications |
| **Sharing** | Share dialog (link / QR / embed code), `embed.js` script embed, iframe embed, custom domains |
| **Templates & Explore** | Seed template catalog, explore page, publish/unpublish workflow |
| **Auth & Admin** | Email/password + Google OAuth (better-auth), cookie sessions, role-gated admin panel via `ADMIN_EMAILS` |
| **Security & UX** | Cloudflare Turnstile bot protection, dark mode, code-split routes, responsive layouts |

## Tech Stack

| Layer | Technology |
|---|---|
| **Monorepo** | Turborepo, pnpm (`pnpm@9`) |
| **Frontend** (`apps/web`) | Vite 6, React 19, React Router 7, Tailwind CSS v4, Radix UI, TanStack Query, tRPC client |
| **API** (`apps/server`) | Express 5, tRPC 11, trpc-to-openapi, Scalar API reference, Multer uploads |
| **Database** | PostgreSQL + Drizzle ORM (migrations + drizzle-kit studio) |
| **Auth** | better-auth (email/password + Google OAuth) |
| **Payments** | Razorpay (orders, subscriptions, webhooks) |
| **Email** | Nodemailer (SMTP) |
| **Hosting** | Vercel (frontend), Render (API + database) |

## Architecture

```
                    ┌─────────────────────────────┐
  Browser  ───────▶ │  apps/web (Vite + React)    │
  (public form,     │  dashboard · builder · admin│
   dashboard,       └──────────────┬──────────────┘
   landing)                         │  VITE_API_URL (trpc + auth)
                    ┌──────────────▼──────────────┐
                    │  apps/server (Express)       │
                    │  /trpc · /auth · /api/payments│
                    │  /openapi.json · /docs       │
                    └──────┬──────────────┬────────┘
                           │              │
                   ┌───────▼──────┐  ┌────▼────────────┐
                   │  PostgreSQL  │  │ Razorpay        │
                   │  (Drizzle)   │  │ + external hooks│
                   └──────────────┘  └─────────────────┘
```

- tRPC routers live in `packages/api` and are mounted by `apps/server` on `/trpc` (JSON-RPC) and `/api` (OpenAPI).
- better-auth endpoints are served at `/auth/*` on the API origin and consumed with `credentials: "include"`.
- Razorpay pushes payment and subscription events to `POST /api/payments/webhook`, signature-verified before any database change.

## Getting Started

### Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18+ (20 LTS recommended) |
| pnpm | 9.x (`npm i -g pnpm@9`) |
| PostgreSQL | 14+ |

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in at least the required values (see [Configuration Reference](#configuration-reference)).

### 3. Run database migrations

```bash
pnpm db:migrate
```

Optionally seed the template catalog:

```bash
pnpm --filter @repo/db db:seed
```

### 4. Start development servers

```bash
pnpm dev
```

| URL | What |
|---|---|
| http://localhost:3000 | Formly frontend (Vite) |
| http://localhost:8000 | Formly API (Express) |
| http://localhost:8000/docs | OpenAPI reference (Scalar) |
| http://localhost:8000/openapi.json | OpenAPI document |

## Configuration Reference

All configuration is loaded via `.env` at the repo root (workspaces share it through `dotenv`).

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Secret used to sign auth tokens (min 16 chars) |
| `BETTER_AUTH_URL` | Canonical URL of the API (e.g. `https://api.example.com`) |
| `BASE_URL` | Public API base URL (same as `BETTER_AUTH_URL` in production) |
| `FRONTEND_URL` | Public frontend origin (must match the browser origin) |
| `VITE_API_URL` | Frontend build-time: tRPC endpoint of the API (e.g. `https://api.example.com/trpc`) |
| `PORT` | API port (default `8000`) |
| `NODE_ENV` | `development` or `prod` — CORS is only enabled when **not** `prod` |

### Optional (leave empty to disable the feature)

| Variable | Purpose |
|---|---|
| `ADMIN_EMAILS` | Comma-separated emails granted admin access |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth sign-in |
| `TURNSTILE_SECRET_KEY` / `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile bot protection |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay test/live keys |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook signature secret |
| `RAZORPAY_PRO_PLAN_ID` | Razorpay plan ID used for Pro subscriptions |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Email notifications |

> `VITE_*` variables are inlined into the frontend bundle at build time — changing them requires a frontend rebuild/redeploy.

## Available Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Watch-mode dev servers for web + API |
| `pnpm build` | Build all apps and packages |
| `pnpm lint` | Lint all apps and packages |
| `pnpm check-types` | Typecheck all apps and packages |
| `pnpm format` | Format code with Prettier |
| `pnpm db:migrate` | Apply database migrations |
| `pnpm db:generate` | Generate migrations from schema changes |
| `pnpm db:seed` | Seed the template catalog |
| `pnpm --filter @repo/db dev` | Open Drizzle Studio (DB browser) |

## Webhooks

### Form webhooks

Outbound notifications configured per form. Requests are signed:

```
x-formly-signature: sha256=<hmac-sha256(secret, body)>
User-Agent: Formly-Webhooks/1.0
```

### Razorpay webhooks

Razorpay pushes events to `POST /api/payments/webhook` at the API origin. Every payload is verified against `RAZORPAY_WEBHOOK_SECRET`, then applied:

| Event | Effect |
|---|---|
| `payment.captured` / `payment.authorized` / `order.paid` | Mark submission as paid |
| `payment.failed` | Mark submission as failed |
| `payment.refunded` / `refund.processed` | Mark submission as refunded |
| `subscription.activated` | Upgrade user plan → `pro` |
| `subscription.cancelled` / `completed` / `halted` / `paused` | Downgrade user plan → `free` |

## Deployment

Formly is deployed as **two stateless services + one managed database**.

### Option A: Render + Vercel (recommended)

**1. Database — Render**

Create a PostgreSQL instance. Keep both connection strings:

- **Internal URL** → used by the API service
- **External URL** → used only for running migrations from your machine

**2. API — Render (Web Service)**

| Setting | Value |
|---|---|
| Root Directory | `apps/server` |
| Build Command | `pnpm install && pnpm build` |
| Start Command | `node dist/index.js` |
| Runtime | Node 22 |

Environment (no quotes, no trailing slashes):

```
PORT=8000
NODE_ENV=development
BASE_URL=https://<api>.onrender.com
BETTER_AUTH_URL=https://<api>.onrender.com
FRONTEND_URL=https://<frontend-domain-or-vercel-url>
BETTER_AUTH_SECRET=<long-random>
DATABASE_URL=<Internal Database URL>
ADMIN_EMAILS=you@example.com
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RAZORPAY_PRO_PLAN_ID=plan_...
TURNSTILE_SECRET_KEY=...
```

> `NODE_ENV` must be `development` (or unset) for CORS to be enabled — `prod` disables it.

**3. Migrations — run once from your machine**

```powershell
$env:DATABASE_URL="<External Database URL>"
pnpm --filter @repo/db db:migrate
```

**4. Frontend — Vercel**

| Setting | Value |
|---|---|
| Monorepo Root Directory | `apps/web` |
| Framework Preset | Vite |
| Build Command | `pnpm install && pnpm build` |
| Output Directory | `dist` |

Environment:

```
VITE_API_URL=https://<api>.onrender.com/trpc
VITE_TURNSTILE_SITE_KEY=0x4AAAA...
```

**5. Post-deploy integration**

| Service | URL |
|---|---|
| Razorpay webhook | `https://<api>.onrender.com/api/payments/webhook` (events: payment & subscription) |
| Google OAuth redirect URI | `https://<api>.onrender.com/auth/callback/google` |
| Turnstile widget | allow the frontend hostname |

### Option B: All on Render

Same as above, but deploy the frontend as a second Render Web Service:

| Setting | Value |
|---|---|
| Root Directory | `apps/web` |
| Build Command | `pnpm install && pnpm build` |
| Start Command | `pnpm start --host 0.0.0.0 --port $PORT` |

`VITE_API_URL` still points at the API service. Everything else is identical.

## Project Structure

```
├── apps/
│   ├── web/                 # Vite + React frontend (landing, builder, dashboard, admin)
│   └── server/              # Express + tRPC API (port 8000)
├── packages/
│   ├── api/                 # tRPC routers (builder, public, payment, subscription, admin, ...)
│   ├── db/                  # Drizzle schema, migrations, seed templates
│   ├── services/            # better-auth config, Nodemailer email
│   ├── logger/              # shared logger
│   └── config/              # shared ESLint / TypeScript configs
├── docs/
│   └── backend-design.md    # architecture & API design notes
├── .env.example             # reference environment file
└── README.md
```

## License

Private project.