# Formly

Build beautiful forms in minutes. Collect answers, analyze responses, and never touch spreadsheet forms again.

Formly is a full-featured form builder platform: a drag-and-drop builder, a public form rendering engine with payments, analytics, templates, embeddable forms, custom domains, and an admin panel — all in a pnpm + Turborepo monorepo.

## Features

- **Form builder** — drag-and-drop layout, 15+ field types, page modes (all-page / one-at-a-time / page breaks), start & end screens, section jumps, conditional logic groups
- **Payments** — Razorpay payment field with server-side order creation, checkout, signature verification and webhook sync
- **Pro subscriptions** — recurring Razorpay subscriptions with a profile page upgrade flow and plan badges
- **Responses ledger** — real-time responses with analytics and export
- **Webhooks & email notifications** — per-form webhook delivery with HMAC signatures, SMTP notifications
- **Sharing & embeds** — share dialog (link / QR / embed code), standalone `embed.js`, iframe embeds, custom domains
- **Templates & explore** — seed template catalog, explore page, publishing workflow
- **Auth** — email/password + Google OAuth via better-auth, cookie sessions, role-gated admin panel
- **Bot protection** — Cloudflare Turnstile
- **Polish** — dark mode, code-split routes, responsive layouts

## Tech Stack

- **Monorepo**: Turborepo + pnpm
- **Frontend** (`apps/web`): Vite, React 19, React Router 7, Tailwind CSS v4, Radix UI, @tanstack/react-query, tRPC client
- **API** (`apps/server`): Express 5, tRPC 11, trpc-to-openapi, Scalar API reference, Multer uploads
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: better-auth
- **Payments**: Razorpay

## Project Structure

```
custom-forms/
├── apps/
│   ├── web/                 # Vite + React frontend (dashboard, builder, landing, admin)
│   └── server/              # Express + tRPC API (port 8000)
├── packages/
│   ├── api/                 # tRPC routers (auth, builder, public forms, payment, subscription, admin...)
│   ├── db/                  # Drizzle schema, migrations, seed templates
│   ├── services/            # better-auth config, email (Nodemailer)
│   ├── logger/              # shared logger
│   └── config/              # shared eslint / typescript configs
└── docs/                    # design docs
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9 (`corepack enable` or `npm i -g pnpm`)
- PostgreSQL (local or remote)

### 1. Install dependencies

```sh
pnpm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in the values:

```sh
cp .env.example .env
```

Required for dev:

```dotenv
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dev"
BETTER_AUTH_SECRET="a-long-random-secret"
BASE_URL="http://localhost:8000"
FRONTEND_URL="http://localhost:3000"
BETTER_AUTH_URL="http://localhost:8000"
ADMIN_EMAILS="you@example.com"        # comma-separated admin emails
VITE_API_URL="http://localhost:8000/trpc"
```

Optional features you can leave empty to disable:

```dotenv
# Google OAuth
GOOGLE_OAUTH_CLIENT_ID=""
GOOGLE_OAUTH_CLIENT_SECRET=""

# Cloudflare Turnstile
TURNSTILE_SECRET_KEY=""
VITE_TURNSTILE_SITE_KEY=""

# Razorpay payments + Pro subscriptions
RAZORPAY_KEY_ID=""
RAZORPAY_KEY_SECRET=""
RAZORPAY_WEBHOOK_SECRET=""
RAZORPAY_PRO_PLAN_ID=""

# Email / SMTP
SMTP_HOST=""
SMTP_PORT=""
SMTP_USER=""
SMTP_PASSWORD=""
EMAIL_FROM="Formly <noreply@example.com>"
```

> The frontend needs a `VITE_` env only at build time — it's inlined into the bundle.

### 3. Run migrations

```sh
pnpm db:migrate
```

To seed the template catalog (optional):

```sh
pnpm --filter @repo/db db:seed
```

### 4. Start the dev servers

```sh
pnpm dev
```

- Frontend: http://localhost:3000
- API: http://localhost:8000 (OpenAPI reference available at `/docs`)
- Drizzle Studio (DB browser): `pnpm --filter @repo/db dev`

## Available Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Run web + API in watch mode |
| `pnpm build` | Build all apps and packages |
| `pnpm lint` | Lint all apps and packages |
| `pnpm check-types` | Typecheck all apps and packages |
| `pnpm db:migrate` | Apply DB migrations |
| `pnpm db:generate` | Generate a new migration from schema changes |
| `pnpm format` | Format with Prettier |

## Webhooks

Form webhooks are delivered to URLs configured per form, signed with `x-formly-signature: sha256=<hmac>`. Razorpay webhooks arrive at `POST /api/payments/webhook` (signature-verified, then payment and subscription events are applied).

## Deployment (Render)

Formly deploys as three Render resources from this monorepo:

1. **PostgreSQL** — create in Render, use the external URL for migrations.
2. **API service** — Root Directory `apps/server`, build `pnpm install && pnpm build`, start `node dist/index.js`. Set `NODE_ENV=development` (CORS is only enabled when not `prod`), `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`/`BASE_URL` = API URL, `FRONTEND_URL` = web URL, plus the optional keys (Google, Razorpay, Turnstile).
3. **Web service** — Root Directory `apps/web`, build `pnpm install && pnpm build`, start `pnpm start --host 0.0.0.0 --port $PORT`. Set `VITE_API_URL` and `VITE_TURNSTILE_SITE_KEY`.

Run `pnpm db:migrate` against the production database once, then update Google OAuth redirect URI and the Razorpay webhook URL to the API service URL (`https://<api>.onrender.com/api/payments/webhook`).

## License

Private project.