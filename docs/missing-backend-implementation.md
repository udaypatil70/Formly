# Missing Backend Implementation

Audit date: 2026-10-17. Scope: everything in `apps/web` that renders, promises, or
stores state, checked against `packages/api`, `apps/server`, and `packages/db`.

---

## 0. Status summary

| Layer | Count |
|---|---|
| tRPC routers | 13 (`packages/api/server/index.ts:17-31`) |
| tRPC procedures | 59 |
| Procedures exposed as REST via `trpc-to-openapi` | 52 (mounted at `/api`) |
| Hand-written Express routes | 3 (`/upload`, `/uploads/:storedName`, `/api/payments/webhook`) plus better-auth `/auth/*` |
| Distinct procedures the frontend calls | 37 |
| DB tables | 18 |

**Every endpoint the frontend actually calls exists.** There is no screen that
hits a 404 or a stub. What is missing is *feature-level*: behaviour the UI
advertises or implies that the server never implements, endpoints that exist
only over tRPC with no REST/OpenAPI surface, and schema columns that are
written but never used.

Legend for severity: **P0** = the product is broken or a promise is a lie ·
**P1** = a visible feature is a facade · **P2** = correctness/hardening ·
**P3** = cleanup.

---

## A. Plans, pricing and entitlements — no backend at all (P0)

The pricing and landing pages are 100% hardcoded and there is no server-side
plan enforcement anywhere in the codebase.

### A.1 What the frontend hardcodes

| Data | Frontend location |
|---|---|
| Prices (`free 0`, `pro 10/8`) | `apps/web/pages/pricing-page.tsx:28-32` and `apps/web/pages/landing-page.tsx:180` — **duplicated, not sourced from the server** |
| Free tier limits (`3 active forms`, `100 responses / month`) | `pricing-page.tsx:45-60,105-120`, `landing-page.tsx:192-220` |
| Pro feature list | `pricing-page.tsx:62-81` |
| Enterprise tier | `pricing-page.tsx:83-98` |
| Feature comparison matrix | `pricing-page.tsx:105-120` |
| FAQs | `pricing-page.tsx:122+` |
| Landing `FEATURES`, `STEPS`, `TESTIMONIALS` | `landing-page.tsx:73,130,154` |

### A.2 What is missing on the server

1. **No plan catalogue endpoint.** There is no `plan.list` / `pricing.get`
   procedure and no `plans` table. Changing a price requires a frontend
   rebuild *and* a Razorpay dashboard edit, and the two can drift silently.
2. **`users.plan` is never used for authorization.** Grep confirms `plan` is
   only read for display (`routes/auth/route.ts:55`,
   `routes/subscription/route.ts:59`, `routes/admin/route.ts:226`) and written
   by the subscription flow (`routes/subscription/route.ts:217,253`,
   `utils/subscriptions.ts:66`). **No procedure checks it.** A `free` user can
   today: create unlimited forms, take unlimited responses, use custom
   domains, use webhooks, and use email notifications.
3. **No quota enforcement.** "3 active forms" and "100 responses / month" are
   advertised but never counted or blocked. `forms.settings.responseLimit` is a
   *per-form* setting unrelated to the plan.
4. **No usage metering.** No `form_usage` / `usage_counters` table, so nothing
   can show "2 of 3 forms used" or "73 / 100 responses this month".
5. **No plan-gating middleware.** There is no `requiresPlan("pro")` middleware;
   `trpc.ts` only has `publicProcedure` / `protectedProcedure` /
   `adminProcedure`.

### A.3 Work needed

- New `plans` table (or config): `key`, `name`, `priceMonthly`, `priceYearly`,
  `currency`, `maxForms`, `maxResponsesPerMonth`, `maxThemes`,
  `features jsonb`, `entitlements jsonb`.
- `plan.list` (public query) → `GET /api/plans`, consumed by `pricing-page.tsx`
  and `landing-page.tsx` (delete the duplicated constants).
- `requiresPlan(...)` middleware + `entitlement` helpers in `trpc.ts`.
- `usage.getMyUsage` (protected) → `{ formsUsed, responsesThisMonth, themesUsed,
  limits, exceeded }` for a usage meter in the dashboard/profile.
- Gate points: `form.create` (max forms), `theme.create` (max themes),
  `public.submitResponse` (monthly response quota — needs a cached counter, not a
  `COUNT(*)` per submit), `form.update` with `customDomain`, `webhook.create`,
  and `settings.notifyOnResponse`.

---

## B. Custom domains — stored and resolved, never verified (P1)

`forms.customDomain` exists (`packages/db/models/form.ts:81`) and
`public.resolveDomain` serves it (`packages/api/server/routes/public/route.ts:305-346`),
but the ownership story does not exist.

### B.1 Missing

1. **No availability check.** `form.checkSlug` exists
   (`routes/form/route.ts:474-483`) but there is no equivalent
   `form.checkDomain`. The field is a free-text input in
   `components/builder/field-inspector.tsx:1289-1300` and the only feedback is
   a unique-constraint error.
2. **No ownership/DNS verification.** No `domain_verification` table, no
   TXT/CNAME challenge token, no `domainStatus` column
   (`pending | verified | failed`), no verification timestamp. Any user can
   claim `bank.com` in the database and it will be served.
3. **No verification/resend/confirm endpoints.**
4. **No TLS / vhost plumbing.** Nothing in `apps/server` terminates TLS or does
   host-based routing; the browser has to call `resolveDomain` with
   `window.location.hostname`. There is no wildcard-cert or
   `DOMAIN_VERIFICATION_DNS_TARGET` env var.
5. **No "is this domain already serving another form" reporting**, and no
   un-claim flow.
6. **`share-dialog.tsx:49-50` builds `https://${customDomain}` unconditionally** —
   no scheme fallback, and it will happily share an unverified domain.

### B.2 Work needed

- `domain_verifications` table: `id`, `form_id`, `domain`, `token`,
  `status`, `attempts`, `expires_at`, `verified_at`.
- `form.checkDomain` (`GET /api/forms/check-domain/{domain}`),
  `form.requestDomainVerification` (`POST` → returns the TXT record to set),
  `form.verifyDomain` (`POST`, does the `dns.resolveTxt` check),
  `form.removeDomain` (`POST`).
- Gate `share-dialog` + `resolveDomain` on `status = "verified"`.
- Add `DOMAIN_VERIFICATION_DNS_TARGET` to `apps/server/src/env.ts` and
  `.env.example`.

---

## C. Admin panel — users and templates are read-only (P1)

`packages/api/server/routes/admin/route.ts` has 5 procedures:
`getStats`, `listUsers`, `listForms`, `setFeatured`, `listExploreForms`.

### C.1 Missing

1. **No user mutations.** `admin.listUsers` renders role/plan/joined columns
   (`apps/web/pages/admin/admin-users-page.tsx`) but there is **no**
   `admin.setUserRole`, `admin.setUserPlan`, `admin.verifyUser`,
   `admin.suspendUser`, `admin.deleteUser`, or `admin.resetUserPassword`.
2. **Role is not persisted.** `utils/admin.ts:8-14` derives admin from the
   `ADMIN_EMAILS` env string on every request; `routes/admin/route.ts:225` and
   `routes/auth/route.ts:54` do the same. There is **no `role` column on
   `users`**, so granting admin requires an env edit + redeploy, and every
   admin action is invisible to auditing.
3. **No template management.** `routes/template/route.ts` has only `listAll`,
   `getById`, `useTemplate`. There is no create/update/delete/publish for
   templates — templates can only come from `packages/db/seed-templates.ts`.
   `admin.setFeatured` on a template row is useless because
   `public.getExploreForms` filters `status = "published"` and templates are
   seeded as `draft`.
4. **`admin.listExploreForms` (`routes/admin/route.ts:340-407`) has no UI.**
5. **No form moderation:** no admin unpublish, no force-delete, no owner
   transfer, no impersonation.
6. **`templateCategory` is unvalidated free text.**
   `forms.template_category` is `varchar(50)`; the frontend uses 9 values
   (`apps/web/pages/templates-page.tsx:44-54`: feedback, sales, education,
   health, events, product, careers, community, it) that exist in no enum
   anywhere. Explore uses a completely different 8-value set
   (`explore-page.tsx:28`).

### C.2 Work needed

- `users.role` column (`user` | `admin`) + backfill from `ADMIN_EMAILS`;
  switch `isAdminEmail` to a DB lookup (keep env as bootstrap).
- `admin.setUserRole`, `admin.setUserPlan`, `admin.deleteUser`,
  `admin.forceUnpublishForm`, `admin.deleteForm`.
- `template.create` / `template.update` / `template.delete` / `template.publish`.
- A `template_category` pgEnum, or a shared `@repo/validators` constant list
  used by both the seed, `template.listAll`, and the frontend filter.

---

## D. File uploads — unauthenticated and unlinked (P0)

`apps/server/src/uploads.ts` is the weakest part of the backend.

### D.1 Missing

1. **No auth on `POST /upload` (`uploads.ts:143-215`).** The only check is that
   the supplied `formId` exists and is not archived. Anyone who learns a form
   UUID can upload to it.
2. **No auth on `GET /uploads/:storedName` (`uploads.ts:96-141`).** Anyone with
   the URL can read the file. There is no ownership check, no expiry, and no
   signed-URL scheme.
3. **No link between an upload and a submission.**
   `form_file_uploads` (`packages/db/models/form.ts:444-460`) has **no FK to
   `responses` or `answers`** and no `response_id` column. The association is
   jsonb convention only.
4. **`FileAnswerValueSchema` (`packages/validators/src/index.ts:289-296`) only
   checks that `fileId` is a uuid and `url` is http(s).** It does not verify the
   upload exists, belongs to this form, or that the URL is on this server. A
   client can submit a fabricated `fileId` or an arbitrary external URL that the
   responses page then renders as a download link.
5. **Per-field limits are client-only.** `validationRules.maxSize` and
   `validationRules.allowedTypes` are enforced in
   `apps/web/components/public/public-form.tsx:509-518` only. The server
   enforces a global 25 MB cap and an 18-MIME allowlist. A crafted multipart
   request bypasses every per-field rule.
6. **No orphan cleanup.** Uploads never referenced by a submission leave both
   the file on disk and the row in `form_file_uploads` forever. No TTL, no
   sweeper job, no disk quota.
7. **`form_file_uploads.form_id` is written but never used as a filter** — there
   is no "list this form's uploads" endpoint, so the builder cannot show or
   purge uploads.

### D.2 Work needed

- `form_file_uploads`: add `response_id uuid → responses.id (SET NULL)` and
  `uploaded_by_ip_hash`; write `response_id` in `public.submitResponse` when a
  `file_upload` answer is persisted.
- In `public.submitResponse`, resolve every `file_upload` answer against
  `form_file_uploads` (exists + `formId` matches + `storedName` matches the URL)
  before insert; reject otherwise.
- Enforce `validationRules.maxSize` / `allowedTypes` server-side in
  `POST /upload` by loading the field from `formId` + `fieldId` (requires the
  client to send `fieldId`).
- Gate `POST /upload` on an unpublished-form rate limit + Turnstile; consider a
  signed, expiring `GET /uploads/:token`.
- A cron/interval sweeper deleting uploads older than N days with no referencing
  answer.

---

## E. Webhooks — event filtering and delivery history missing (P1)

### E.1 Missing

1. **`form_webhooks.events` is stored and ignored.**
   `packages/api/server/utils/webhooks.ts:106-127` fans out `response.created` to
   every `active` hook without consulting the `events` array. The builder lets
   you pick events (`field-inspector.tsx:1062-1089`) but the choice has no
   effect.
2. **Only one event type exists.** No `response.updated`, `payment.paid`,
   `payment.refunded`, `form.published`, `form.unpublished`, or
   `draft.saved`.
3. **No delivery log.** There is no `form_webhook_deliveries` table, so
   `lastStatus` / `lastError` / `lastTriggeredAt` are the only history and only
   for the most recent attempt.
4. **No retry / backoff / dead-lettering.** Delivery is fire-and-forget once.
5. **No HMAC secret rotation** and no way to reveal/rotate an existing secret
   (`webhook.update` can overwrite it blind).
6. **No per-delivery payload preview** beyond the hard-coded sample in
   `webhook.test` (`routes/webhook/route.ts:202-210`).

### E.2 Work needed

- `form_webhook_deliveries` table: `id`, `webhook_id`, `event`, `requestBody`,
  `responseStatus`, `responseBody`, `error`, `durationMs`, `attempt`, `nextRetryAt`.
- Filter in `triggerWebhooks` on `events` (jsonb `@>`).
- A delivery worker with exponential backoff; expose
  `webhook.deliveries` (`GET /api/webhooks/{id}/deliveries`) for the builder UI.

---

## F. Analytics — no aggregation, no attribution (P1/P2)

### F.1 Missing

1. **No daily aggregate table.** `analytics.getStats`
   (`packages/api/server/routes/analytics/route.ts:84-98`) loads **every**
   `form_views` row and **every** `responses` row into memory to bucket in JS.
   This will fall over on any form with real traffic, and the frontend polls it
   **every 5 seconds** (`apps/web/pages/analytics-page.tsx:94`,
   `refetchInterval: 5_000`), as does `payment.list` and `response.list` every
   10 s.
2. **No referrer / UTM attribution.** `form_views`
   (`packages/db/models/form.ts:415-430`) stores only `viewed_at`, `device`,
   `browser`. There is no `referrer`, `utm_source`, `utm_medium`,
   `utm_campaign`, or `source` column, and the share dialog
   (`apps/web/components/share/share-dialog.tsx`) generates links without UTMs.
   No traffic-source chart is possible.
3. **No geography.** No `country`/`region` column and no IP→country lookup.
4. **No per-step funnel timing.** `getDropOff` gives coverage per field but not
   time-to-abandon per step.
5. **`responses.ip_hash` is write-only.** Written at
   `routes/public/route.ts:704`, never read (only an index exists to serve
   queries that were never written). Duplicate-submission detection and
   "unique respondents" metrics are therefore impossible today.
6. **No response-quality metrics:** no partial-submission detection, no
   back-button/ abandonment signal, no per-device conversion rate.
7. **No date-range input.** All three analytics procedures are all-time; the
   frontend cannot pick a window even though it charts "last 30 / 14 days".

### F.2 Work needed

- `form_daily_stats` table (`form_id`, `day`, `views`, `responses`, `device
  jsonb`, `browser jsonb`) maintained by a nightly/upsert job; `getStats`
  reads it.
- Extend `form_views` with `referrer`, `utm_*`, `country`; populate from the
  `Referer` header / query params in `public.getFormBySlug`.
- Add `from`/`to` to `analytics.getStats` / `getDropOff` / `getFieldBreakdown`.
- A 24–48 h rolling view cache, or drop the 5 s polling to a websocket/SSE feed
  (also not implemented — there is no realtime channel despite `README.md`
  claiming "real-time").
- Read `ip_hash` for a `uniqueRespondents` metric and duplicate-submission
  rejection.

---

## G. Payments and subscriptions — correctness gaps (P0/P2)

### G.1 Missing

1. **`subscription.verifySubscriptionPayment` fails open.**
   `routes/subscription/route.ts:209-211` —
   `paid = subscription ? isPaidStatus(...) : **true**`. If the Razorpay fetch
   throws or the subscription is missing, the user is upgraded to `pro`.
2. **Razorpay webhook has no idempotency/replay protection.**
   `apps/server/src/payments.ts:17-54` never reads or stores
   `x-razorpay-event-id`; a replayed `payment.refunded` re-runs.
3. **Webhook `razorpay_payment_id` fallback can downgrade a paid row.**
   `packages/api/server/utils/payments.ts:65-73` matches on payment id with no
   `status` guard, contradicting the file's own docstring. A replayed
   `payment.failed` can flip a `paid` row to `failed`.
4. **Payment ledger is truncated at 500 rows.**
   `routes/payment/route.ts:200` `.limit(500)`, and `totals` (`:203-234`) are
   computed only over those rows — so the "total paid" figure on
   `analytics-page.tsx:777` is wrong for any form with more than 500 payments.
5. **No pagination or filters on `payment.list`.** The frontend re-fetches the
   whole (capped) ledger every 10 seconds.
6. **No refund initiation.** No admin or owner-facing "refund this payment"
   endpoint — refunds only happen if someone does it in the Razorpay dashboard.
7. **No payment-field-level validation of `validationRules.amount` at submit.**
   Amount comes from the field config, which is client-editable by the form
   owner (acceptable) but there is no minimum/maximum and no multi-currency
   handling beyond `currency` passthrough.
8. **`form_payments.metadata` is write-only** (written at
   `routes/payment/route.ts:143`, never read — `payment.list` re-derives
   `fieldLabel` by joining `fields`).
9. **No subscription state reconciliation job.** If the webhook is missed the
   user's plan is wrong forever; `getMySubscription` never re-fetches from
   Razorpay.
10. **No invoice/plan change API** — no upgrade Pro→Enterprise, no seat count,
    no proration, no `subscription.changePlan`.

### G.2 Work needed

- Fix the fail-open in `verifySubscriptionPayment` (default `false`).
- Add a `razorpay_webhook_events` table keyed on `x-razorpay-event-id` for
  idempotency; add `status` guards to the payment-id fallback branch.
- Replace `.limit(500)` with real pagination + SQL `SUM` aggregates for totals.
- `payment.refund` (owner/admin) → Razorpay refund API + status update.
- A reconciliation job (`getMySubscription` re-checks Razorpay when
  `subscriptionStatus` is stale).

---

## H. Auth — email verification and password reset not implemented (P1)

### H.1 Missing

1. **The `verifications` table is dead.** `packages/db/models/auth.ts:49-56`
   (created in migration `0001`) is wired into the better-auth adapter
   (`packages/services/auth.ts:20-21`) but `services/auth.ts:32-38` configures
   only `emailAndPassword.enabled` + length bounds. There is **no**
   `emailAndPassword.requireEmailVerification`, no `emailVerification`
   block, no verification email. `users.emailVerified` defaults to `false` and
   nothing ever checks it.
2. **No password reset / forgot password.** No `emailAndPassword.sendResetPassword`,
   no `/forgot-password` or `/reset-password` page, no route.
3. **No session management UI.** No `listSessions` / `revokeSession` /
   `revokeOtherSessions` endpoint; `dashboard-header.tsx:49` and
   `sign-out-button.tsx:15` call better-auth's `POST /auth/sign-out` directly and
   never touch the tRPC `auth.signOut` that already exists
   (`routes/auth/route.ts:70`).
4. **No account deletion.** No self-serve "delete my account" endpoint, no
   data-retention job (advertised for Enterprise).
5. **No Turnstile / rate limit on `auth.*` beyond better-auth defaults.** The
   Postgres `rateLimit` helper is never applied to sign-in/sign-up, and
   `TRUST_PROXY` must be set correctly for IP-based limits to mean anything.

### H.2 Work needed

- `emailVerification: { sendOnSignUp, autoSignInAfterVerification }` +
  a Nodemailer sender; add a `FORGOT_PASSWORD_ENABLED` env.
- `auth.requestPasswordReset` / `auth.resetPassword` tRPC procedures, or lean on
  better-auth's `/auth/forget-password` + a frontend page.
- `auth.listSessions`, `auth.revokeSession`, `auth.deleteAccount`.

---

## I. REST / OpenAPI surface gaps (P2)

### I.1 Missing

1. **7 procedures are tRPC-only** — no `.meta({ openapi })`, so they are
   invisible in `/openapi.json` and unreachable over REST:
   - `form.versionsList` / `versionsGet` / `versionsSave` / `versionsRestore`
     (`routes/form/route.ts:486,517,558,607`)
   - `public.resolveDomain` (`routes/public/route.ts:305`)
   - `public.saveDraft` (`routes/public/route.ts:349`)
   - `public.getDraft` (`routes/public/route.ts:445`)
2. **3 hand-written Express routes are absent from the OpenAPI document**:
   `POST /upload`, `GET /uploads/{storedName}`, `POST /api/payments/webhook`.
   `apps/server/src/server.ts:27-31` generates the document purely from the tRPC
   router.
3. **The frontend docs page is out of sync with the real API.**
   `apps/web/pages/docs-page.tsx` documents 21 endpoints and is wrong or
   incomplete in several places:
   - `:348-356` claims `GET /analytics/{formId}` returns drop-off and per-field
     data — those are separate endpoints (`/dropoff`, `/fields`).
   - `:326-333` implies a CSV download; `response.exportCsv`
     (`routes/response/route.ts:153`) returns JSON `{ filename, csv }` and the
     frontend builds the Blob client-side (`responses-page.tsx:103`).
   - `:368-395` lists only 2 rate limits; 5 more exist (password guesses
     10/15 min, drafts 20/min, domain resolve 30/min, order creation 10/min,
     Pro subscription 5/min).
   - Never mentions `/api/fields/*`, `/api/webhooks/*`, `/api/admin/*`,
     `/api/templates/*`, `/api/payments*`, `/api/subscriptions/*`,
     `/api/profile`, `/api/forms/{id}/{clone,archive,restore,unpublish}`,
     `/api/forms/check-slug/{slug}`, `/api/forms/slug/{slug}`.
4. **`health` is duplicated and untagged.** `GET /health`
   (`apps/server/src/server.ts:75-77`, `{message, healthy}`) and
   `GET /api/health` (`routes/health/route.ts:6`, `{status:"healthy"}`). The
   express one **never touches the database**, so it reports healthy while
   Postgres is down. No readiness probe, no `/health/live` vs `/health/ready`
   split, and no frontend status widget.
5. **No express 404 / error handler** at the app level
   (`apps/server/src/server.ts` ends at line 111) — unmatched paths return
   Express's HTML 404, unmatched errors its HTML 500.
6. **`auth.signOut` exists twice** — `POST /auth/sign-out` (better-auth) and
   `POST /api/auth/sign-out` (generated, `routes/auth/route.ts:70`) — and the
   frontend only uses the first.

---

## J. Public form runtime gaps (P1/P2)

1. **No duplicate-submission protection.** `responses.ip_hash` is written but
   never checked; a respondent can submit the same form N times until the
   5/min rate limit stops them.
2. **`unlisted` visibility is not enforced anywhere.**
   `form_visibility` = `public | unlisted` (`packages/db/models/form.ts:24-27`)
   and `form.update` writes it, but `public.getFormBySlug` serves both and
   `public.getExploreForms` ignores it. There is no "not listed / not found"
   state in `publicFormViewOutput`.
3. **Drafts are not bound to the visitor.** `form_drafts` has no IP hash, no
   session, no email — the 32-byte resume token is the only credential, there is
   no rate limit on `public.getDraft` (only on `saveDraft`,
   `routes/public/route.ts:359-362`), and no endpoint to delete a draft.
4. **No partial/ resumable submission** and no "edit my response" link —
   `responses` rows are immutable once written.
5. **No form-level `responses.ipHash` uniqueness or bot heuristics** beyond
   Turnstile (which **fails open** when `TURNSTILE_SECRET_KEY` is unset —
   `packages/api/server/utils/turnstile.ts:15`).
6. **No scheduled form opening/closing** beyond a single `settings.expiry`
   timestamp, and no `opensAt`/`closesAt` window.
7. **No response-count target** (`settings.responseLimit` is a hard cap with no
   soft target/close message).
8. **No per-field answer editing or admin annotation** on a response, and no
   `responses.notes` / `responses.tags` / `starred` columns.
9. **`conditional_logic` is evaluated entirely client-side**
   (`apps/web/components/public/public-form.tsx`). The server validates only
   visible fields (`routes/public/route.ts:591-602`), so a crafted request can
   submit answers for hidden fields and they will be stored and counted in
   analytics.

---

## K. Marketed on the pricing page but absent entirely (P1)

`pricing-page.tsx:83-98,105-120` and `landing-page.tsx:221-225` advertise these
for Enterprise. None exist:

| Promise | Reality |
|---|---|
| **SSO / SAML authentication** | Nothing. Only better-auth email/password + Google (`packages/services/auth.ts:68-74`). |
| **Audit logs** | No `audit_logs` table, no audit middleware. `context.ts:6` mentions auditing in a comment only. |
| **Data retention** | No retention job. `form_drafts.expires_at` is written (`routes/public/route.ts`) but **never enforced by any cleanup query**. |
| **Dedicated success manager / 99.9% SLA** | N/A (no backend). |
| **"All 50+ branded themes"** | The seed creates **10** themes (`packages/db/seed-themes.ts`). No endpoint serves a theme catalogue or count. |
| **"Real-time analytics"** (`landing-page.tsx:215`) | It is 5-second polling (`analytics-page.tsx:94`). No websocket/SSE anywhere. |
| **"50+ branded themes" / theme marketplace** | No theme browse/share/duplicate flow; `theme.getAll` returns only built-ins + your own. |

---

## L. Rate-limit and abuse coverage gaps (P2)

`packages/api/server/utils/rate-limit.ts` (Postgres sliding window) is applied
to 7 procedures. Not applied:

| Surface | Gap |
|---|---|
| `POST /auth/sign-in/email`, `/auth/sign-up/email` | No IP rate limit, no lockout (better-auth defaults only). Brute force is unbounded. |
| `POST /upload` | Uses a **separate in-memory** limiter (`apps/server/src/uploads.ts:61-83`, 10/min) — lost on restart, not shared across instances, and bypassed by scaling out. |
| `public.getDraft` | Unbounded token guessing (tokens are 64 hex chars, so low risk, but no limit). |
| `form.checkSlug` | Unbounded enumeration of the slug space. |
| `theme.getAll`, `template.*` | No limit. |
| `webhook.test` | Fires an outbound HTTP request on demand — unbounded SSRF-adjacent abuse (SSRF is validated, volume is not). |
| `response.list` / `analytics.*` / `payment.list` | No per-user limit; the frontend's 5 s / 10 s polling multiplies DB load. |

Also: `Turnstile` is only checked in `public.submitResponse`
(`routes/public/route.ts:562-571`), not on `saveDraft`, `createOrder`, or
`/upload`.

---

## M. Config, env and documentation drift (P2/P3)

| Issue | Detail |
|---|---|
| `UPLOADS_DIR` undocumented | Declared `apps/server/src/env.ts:8-11`, used `server.ts:88`. **Absent from `.env.example` and from the README config table.** Silently defaults to `./uploads`. |
| `NEXT_PUBLIC_API_URL` is dead | `.env.example:31`. Zero code references — the app is Vite, not Next.js. |
| `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` are dead | Present in the local `.env` and `docker-compose.yml`, read by nothing. |
| `BETTER_AUTH_SECRET` min length is wrong in the README | `README.md:149` says "min 16 chars"; `packages/services/env.ts:48` enforces **32**. The `.env.example` placeholder is rejected at boot. |
| `NODE_ENV` / CORS claim is wrong | `README.md:155` says "CORS is only enabled when not prod". CORS is always on (`apps/server/src/server.ts:42-52`); `NODE_ENV` is validated but unused in `apps/server/src`. `README.md:250` contradicts `:155`. |
| `TRUST_PROXY` undocumented | `.env.example:28` (commented) but absent from both README config tables, and it is required for IP rate limits to work behind Render/Vercel. |
| `RAZORPAY_PRO_PLAN_ID` read via raw `process.env` | `routes/subscription/route.ts:65,106` bypass the `env` module used everywhere else. Same for `utils/razorpay.ts:12,13,217` and `utils/turnstile.ts:14`. |
| `docs/backend-design.md` is stale | Says `field_type` has 16 values (it has 17) and does not cover drafts, custom domains, payments, subscriptions, versions, templates or explore — all of which shipped. |

---

## N. Dead code and schema to clean up (P3)

| Item | Location |
|---|---|
| `generatePath()` — exported, zero importers | `packages/api/server/utils/path-generator.ts` (whole file) |
| `getFormWithEverything()` — never called | `packages/api/server/utils/form.ts:120` |
| `serializeField()` — never called | `packages/api/server/utils/serialize.ts:29` |
| `needsRehash()` — never called | `packages/api/server/utils/password.ts:81` |
| `FORBIDDEN_INLINE` mime set — unreachable | `apps/server/src/uploads.ts:46-54` |
| `form.versionsGet` — implemented, never called by the frontend | `packages/api/server/routes/form/route.ts:517` |
| `admin.listExploreForms` — implemented, no UI | `packages/api/server/routes/admin/route.ts:340` |
| Write-only column `responses.ip_hash` | written `routes/public/route.ts:704` |
| Write-only column `form_payments.metadata` | written `routes/payment/route.ts:143` |
| Write-only column `users.plan_updated_at` | written `routes/subscription/route.ts:220,255` |
| Written-but-unfiltered `form_webhooks.events` | `packages/db/models/form.ts:481` |
| Written-but-unfiltered `form_file_uploads.form_id` | `packages/db/models/form.ts:450` |
| Dead table `verifications` | `packages/db/models/auth.ts:49-56` |
| `form_versions.theme_id` has no FK | `packages/db/models/form.ts:195` — snapshots can dangle |
| 3 redundant indexes duplicating UNIQUE constraints | `forms_slug_idx`, `form_drafts_resume_token_idx`, `form_payments_order_id_idx` |
| **Hashed form password returned to the owner** | `utils/schemas.ts:95` + `utils/serialize.ts:15` spread the whole row into `formMetaOutput` |
| `field.reorder` skips membership validation | `routes/field/route.ts:200-208` updates `order` for arbitrary `orderedIds` |
| `minLabel`/`maxLabel` missing from `fields.validation_rules.$type` | `packages/db/models/form.ts:250-262` vs `packages/validators/src/index.ts:37-38` |
| `FormVersionField.validationRules` narrower than what `versionsSave` writes | `packages/db/models/form.ts:160-168` — restoring a snapshot loses `scale` / `file_upload` config |
| Template field-type labels missing 6 types | `apps/web/pages/templates-page.tsx:58-69` — `phone`, `url`, `time`, `scale`, `file_upload`, `payment` render the wrong icon |
| Two different API-URL fallbacks | `apps/web/trpc/create-client.ts:3` (`"/trpc"`) vs `apps/web/lib/api-origin.ts:1` (`"http://localhost:8000/trpc"`) |
| Duplicated Razorpay checkout loader | `public-form.tsx:99-120` and `apps/web/lib/razorpay.ts:23-57` |
| Duplicated pricing constants | `landing-page.tsx:180` vs `pricing-page.tsx:28` |

---

## Suggested build order

**P0 — ship-blocking correctness**
1. `POST /upload` + `GET /uploads/:storedName` auth, `response_id` FK, and
   server-side validation of `fileId` in `submitResponse` (D).
2. Fix `verifySubscriptionPayment` fail-open (G.1.1).
3. Razorpay webhook idempotency + status guards (G.1.2, G.1.3).
4. Enforce plan entitlements, or remove the limits from the pricing page (A).

**P1 — features that are currently facades**
5. Plan catalogue + `requiresPlan` middleware + usage metering (A).
6. Custom-domain availability check and DNS verification (B).
7. `users.role` column + admin user mutations + template CRUD (C).
8. `form_daily_stats` aggregation + referrer/UTM columns; stop the 5 s
   full-table polling (F).
9. Webhook event filtering + delivery log (E).
10. better-auth email verification + password reset (H).

**P2 — hardening**
11. `field.reorder` membership check; strip the password hash from
    `formMetaOutput` (N).
12. Upload limiter → Postgres; rate-limit auth endpoints (L).
13. OpenAPI annotations for the 7 tRPC-only procedures + document the 3 Express
    routes; fix `docs-page.tsx` (I).
14. `/health/ready` with a real DB probe; app-level 404 + error handler (I.4, I.5).
15. CSV streaming response instead of JSON (I.3).
16. Env/README reconciliation: `UPLOADS_DIR`, `TRUST_PROXY`, drop
    `NEXT_PUBLIC_API_URL` and `DB_*` (M).

**P3 — cleanup**
17. Delete dead utils, redundant indexes, the dead `verifications` table (N).
18. Fix the `$type` drift on `validation_rules` and `FormVersionField` (N).
