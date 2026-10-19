# Backend Design Write-up

This document describes the backend for features #3–#7:

1. **#3** New field types: Phone, URL, Time, Scale (NPS), File upload
2. **#4** Conditional logic groups (AND/OR) + jump-to-section / jump-to-submit
3. **#5** Start & end screens
4. **#6** Webhooks (HMAC-signed payloads)
5. **#7** File uploads

Everything below reflects the code as implemented.

---

## #3 — New field types

### Enum (`packages/db/models/form.ts`)

`field_type` is a Postgres enum (16 values). New values live in the same
migration that added other types:

| Type | Input rendered by | Validation |
| --- | --- | --- |
| `phone` | `<input type="tel">` | `/^[+]?[0-9\s\-().]{7,20}$/` |
| `url` | `<input type="url">` | `z.string().url()` |
| `time` | `<input type="time">` | `/^(?:[01]\d|2[0-3]):[0-5]\d$/` + optional `min`/`max` |
| `scale` | 1–N pill buttons (default 1..10) | integer, default min 1 / max 10 |
| `file_upload` | drag/drop-style file button | see #7 |

### Validation rules (`packages/validators/src/index.ts`)

`ValidationRules` jsonb gained:

```ts
maxSize?: number;          // MB limit for file_upload (default 25)
allowedTypes?: string[];   // MIME allowlist for file_upload
minLabel?: string;         // scale left label
maxLabel?: string;         // scale right label
```

`buildFieldValidator` (used by the public submit endpoint) has an explicit
branch per type so zod never falls back to a generic string.

### DB storage

Fields keep the single `fields` table; type-specific config goes in the
`validation_rules` jsonb column. No per-type tables — new types are purely a
validation + rendering concern.

---

## #4 — Conditional logic groups + jump-to-section

### Data model (`conditional_logic` jsonb)

```ts
{
  showIf?: { fieldId, operator, value },            // legacy single rule
  groups?: Array<{
    id: string,                                     // uuid
    all: boolean,                                   // true = AND, false = OR
    conditions: Array<{ fieldId, operator, value }>
  }>,
  gotoPageId?: string,                              // jump to page after a page-break
  gotoSubmit?: boolean                              // jump straight to submission
}
```

`operator ∈ { equals, not_equals, contains, greater_than, less_than }`,
`value ∈ string | number | boolean`.

These shapes are validated by `ConditionalLogicSchema` in
`packages/validators`, written to the `conditional_logic` jsonb column, and
forwarded verbatim to the public form inside `fieldOutput`
(`z.record` passthrough in `packages/api/server/utils/schemas.ts`).

### Evaluation (public runtime)

`fieldIsVisible(field, values)` in `apps/web/components/public/public-form.tsx`:

- if `showIf` exists (legacy) it must match, then
- if `groups` exist, **at least one group must match**; within a group all
  conditions must match when `all = true`, any when `all = false`.

### Jump-to-section

A field condition can carry `gotoPageId` (a page-break field id) or
`gotoSubmit`. When the user advances past a step containing that field the
runtime jumps to the first visible step *after* the referenced page break, or
straight to submit. Targets are resolved against the ordered `steps` array so
hidden sections are skipped automatically.

### Submission correctness

The submit-time validation schema is built from *currently visible* fields
only (`visibleFields`), and zod objects strip unknown keys — so hidden
required fields neither block submission nor leak their (empty) values.

---

## #5 — Start & end screens

### Storage

`settings` jsonb on `forms` gained two optional objects:

```ts
startScreen?: { enabled, title?, description?, buttonLabel? }
endScreen?:   { enabled, title?, message?, buttonLabel? }
```

Serialized out of `serializeForm` (`packages/api/server/utils/serialize.ts`),
exposed by the public view
(`publicFormViewOutput.settings` in `packages/api/server/routes/public/route.ts`),
and rendered by the public form component. When `startScreen.enabled` is set,
the form shows a welcome card (defaulting the title to the form title) before
step 0; after submit the end screen shows with defaults when the custom block
is off.

---

## #6 — Webhooks

### Table (`form_webhooks`, migration `0011`)

```ts
id            uuid pk
form_id       uuid fk → forms (cascade)
url           text not null
secret        text nullable            // shared secret for HMAC
events        jsonb default ["response.created"]
active        boolean default true
last_status   integer nullable          // HTTP status of last delivery
last_error    text nullable
last_triggered_at timestamp nullable
created_at    timestamp default now
```

### API (`packages/api/server/routes/webhook/route.ts`)

All protected + owner-scoped (`assertFormOwner`):

| Procedure | Method/path | Notes |
| --- | --- | --- |
| `list` | GET `/webhooks` | by `formId`; never returns the secret |
| `events` | GET `/webhook-events` | the shared event catalogue |
| `create` | POST `/webhooks` | url validated, secret generated unless supplied |
| `update` | PATCH `/webhooks/{id}` | url / events / active; re-enabling clears failure state |
| `delete` | DELETE `/webhooks/{id}` | cascades the delivery log |
| `rotateSecret` | POST `/webhooks/{id}/rotate-secret` | returns the new secret once |
| `revealSecret` | GET `/webhooks/{id}/secret` | owner-only recovery |
| `test` | POST `/webhooks/{id}/test` | real payload for a chosen event, logged as a delivery |
| `preview` | GET `/webhooks/preview` | sample payload + headers, sends nothing |
| `deliveries` | GET `/webhooks/{id}/deliveries` | paginated, filterable by status/event |
| `redeliver` | POST `/webhooks/deliveries/{id}/redeliver` | re-sends a settled attempt |
| `resign` | POST `/webhooks/deliveries/{id}/resign` | recompute the signature for debugging a receiver |

Registered as `webhook: webhookRouter` on `serverRouter`.

### Events (`packages/validators`)

`WEBHOOK_EVENTS` is the single catalogue shared by the API and the builder, so a
hook can never subscribe to an event the pipeline does not emit.

| Event | Emitted from |
| --- | --- |
| `response.created` | `public.submitResponse` |
| `response.updated` | `response.update` (owner edits a response) |
| `payment.paid` | `public.submitResponse` on commit; `applyRazorpayWebhookEvent` |
| `payment.refunded` | `applyRazorpayWebhookEvent` — refunds happen entirely on Razorpay's side |
| `form.published` / `form.unpublished` | `form.publish` / `unpublish` / `archive`, on a real transition only |
| `draft.saved` | `public.saveDraft` |

`"*"` in a hook's `events` subscribes to all of them.

### Delivery (`packages/api/server/utils/webhooks.ts` + `webhook-delivery.ts`)

Emission (`emitWebhookEvent`) is fire-and-forget, so a slow endpoint never delays
a submission:

1. Load active hooks for the form and keep those subscribed to the event.
2. Build the payload via `buildWebhookPayload` and write **one
   `form_webhook_deliveries` row per hook**, then attempt them.
3. Sign with **HMAC-SHA256** over `<timestamp>.<body>` and send
   `x-formly-signature: t=<unix>,v1=<hex>`, alongside `x-formly-event`,
   `x-formly-delivery` (idempotency key) and `x-formly-attempt`. No secret → no
   header.
4. Record status, duration, response body and the retry schedule.

**Retries.** `startWebhookWorker` (`apps/server/src/webhook-worker.ts`) drains
due rows on an interval. Backoff is exponential with full jitter, capped by
`WEBHOOK_RETRY_MAX_MS`, and stops after `WEBHOOK_MAX_ATTEMPTS` — the row stays
visible as `dead`. Only 408/425/429, 5xx and transport failures retry; any other
4xx is treated as final, since re-sending an identical body cannot change the
answer. Rows are claimed with `FOR UPDATE SKIP LOCKED`, so multiple instances are
safe and a worker that dies releases its lease.

**Auto-disable.** `WEBHOOK_AUTO_DISABLE_FAILURES` consecutive failures (default
25) switch a hook off with a reason; re-enabling from the UI clears it.

Consumers verify integrity by recomputing the HMAC over `<timestamp>.<raw body>`
and rejecting anything outside their replay window.

---

## #7 — File uploads

### Table (`form_file_uploads`, migration `0011`)

```ts
id           uuid pk
form_id      uuid fk → forms (cascade)
stored_name  text not null unique   // uuid + sanitized extension, on-disk name
original_name text not null
mime_type    text not null
size         integer not null
created_at   timestamp default now
```

### REST endpoints (`apps/server/src/uploads.ts`)

Added to the express app (which already hosts auth + trpc):

- **`POST /upload`** (multipart, `file` + `formId`, multer memory buffer):
  - 25 MB limit, 1 file, MIME allowlist (images, PDFs, spreadsheets, docs,
    zip, audio, video), per-IP rate limit 10/min.
  - Validates the form exists and isn't archived.
  - Streams the buffer to `UPLOADS_DIR`, inserts a `form_file_uploads` row.
  - Returns `{ fileId, name, size, mimeType, url: "/uploads/<storedName>" }`.
  - Multer errors map to clean JSON errors.
- **`GET /uploads/:storedName`**:
  - Validates the stored-name shape, looks up the row, serves the file with its
    stored MIME type, `Content-Disposition: inline` with an RFC 5987 filename,
    immutable cache. Download URLs are stable and random (unguessable).

`UPLOADS_DIR` defaults to `./uploads` (`apps/server/src/env.ts`).

### Answer value

`answers.value` (jsonb) may now be a file object:

```ts
{ fileId, name, url, size, mimeType }
```

Covered by `FileAnswerValueSchema` in validators and rendered as a clickable
link in the responses page / CSV export / email notification. The public form
uploads the file first, stores the resulting object as the field's value, and
the submit endpoint validates/accepts it like any other answer type.