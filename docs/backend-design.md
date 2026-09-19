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
| `list` | GET `/webhooks` | by `formId` |
| `create` | POST `/webhooks` | url validated, secret optional, events default |
| `update` | PATCH `/webhooks/{id}` | url / secret / events / active |
| `delete` | DELETE `/webhooks/{id}` | |
| `test` | POST `/webhooks/{id}/test` | sends a sample `response.created` payload synchronously |

Registered as `webhook: webhookRouter` on `serverRouter`.

### Delivery (`packages/api/server/utils/webhooks.ts`)

Fire-and-forget on response submit, from
`public/route.ts → triggerWebhooks(...)`:

1. Load active webhooks for the form.
2. Build the JSON payload:
   ```json
   { "event": "response.created", "form": {…}, "response": { id, submittedAt, answers[] } }
   ```
3. Sign the exact JSON body with **HMAC-SHA256** using the hook secret and send
   `x-formly-signature: sha256=<hex>`. No secret → no header.
4. `POST` with a 10 s timeout; on success/failure update `lastStatus`,
   `lastError`, `lastTriggeredAt`. Failures never affect the stored response.

Consumers verify integrity by recomputing the HMAC over the raw body.

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