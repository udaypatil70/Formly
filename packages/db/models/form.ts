import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  text,
  integer,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./user";

// ─── Enums ────────────────────────────────────────────────

export const formStatusEnum = pgEnum("form_status", [
  "draft",
  "published",
  "unpublished",
]);

export const formVisibilityEnum = pgEnum("form_visibility", [
  "public",
  "unlisted",
]);

/**
 * Verification state of `forms.custom_domain`. `public.resolveDomain` only
 * serves a form whose domain is `verified`, so a domain can never be hijacked
 * by writing the column directly.
 */
export const domainStatusEnum = pgEnum("domain_status", [
  "pending",
  "verified",
  "failed",
]);

/**
 * Categories a form template can be filed under. Shared with the frontend
 * through `@repo/validators` so the picker and the API cannot disagree.
 */
export const templateCategoryEnum = pgEnum("template_category", [
  "feedback",
  "sales",
  "education",
  "health",
  "events",
  "product",
  "careers",
  "community",
  "it",
]);

export const fieldTypeEnum = pgEnum("field_type", [
  "short_text",
  "long_text",
  "email",
  "number",
  "single_select",
  "multi_select",
  "checkbox",
  "radio",
  "rating",
  "date",
  "page_break",
  "phone",
  "url",
  "time",
  "scale",
  "file_upload",
  "payment",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "created",
  "paid",
  "failed",
  "refunded",
]);

export const themeCategoryEnum = pgEnum("theme_category", [
  "movies",
  "anime",
  "games",
  "startups",
  "tech",
  "os",
  "events",
  "community",
]);

// ─── Forms ────────────────────────────────────────────────

export const formsTable = pgTable(
  "forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    /** Apex/vhost served by the frontend that resolves straight to this form. */
    customDomain: varchar("custom_domain", { length: 255 }).unique(),
    /**
     * Only a `verified` domain is served. Defaults to `pending` so an unverified
     * claim can never be live.
     */
    customDomainStatus: domainStatusEnum("custom_domain_status")
      .default("pending")
      .notNull(),
    customDomainVerifiedAt: timestamp("custom_domain_verified_at"),
    status: formStatusEnum("status").default("draft").notNull(),
    visibility: formVisibilityEnum("visibility").default("public").notNull(),
    archived: boolean("archived").default(false).notNull(),
    isFeatured: boolean("is_featured").default(false).notNull(),
    isTemplate: boolean("is_template").default(false).notNull(),
    templateCategory: templateCategoryEnum("template_category"),
    themeId: uuid("theme_id").references(() => themesTable.id, {
      onDelete: "set null",
    }),
    settings: jsonb("settings")
      .$type<{
        password?: string;
        expiry?: string;
        responseLimit?: number;
        thankYouMessage?: string;
        stepMode?: "all" | "page" | "question";
        notifyOnResponse?: boolean;
        notificationEmail?: string;
        sendConfirmation?: boolean;
        confirmationEmailFieldId?: string;
        startScreen?: {
          enabled: boolean;
          title?: string;
          description?: string;
          buttonLabel?: string;
        };
        endScreen?: {
          enabled: boolean;
          title?: string;
          message?: string;
          buttonLabel?: string;
        };
      }>()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
  },
  (table) => [
    index("forms_owner_id_idx").on(table.ownerId),
    index("forms_status_idx").on(table.status),
    index("forms_slug_idx").on(table.slug),
    index("forms_custom_domain_status_idx").on(table.customDomainStatus),
  ],
);

// ─── Custom Domain Verification ──────────────────────────
// One live challenge per form. Holds the secret token the owner must publish in
// DNS before `forms.custom_domain_status` flips to `verified`. Re-requesting
// rotates the token, which is what invalidates an old challenge.

export const domainVerificationsTable = pgTable(
  "domain_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => formsTable.id, { onDelete: "cascade" })
      .unique(),
    domain: varchar("domain", { length: 255 }).notNull(),
    token: varchar("token", { length: 64 }).notNull(),
    status: domainStatusEnum("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    lastCheckedAt: timestamp("last_checked_at"),
    expiresAt: timestamp("expires_at").notNull(),
    verifiedAt: timestamp("verified_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
  },
  (table) => [
    index("domain_verifications_domain_idx").on(table.domain),
    index("domain_verifications_status_idx").on(table.status),
  ],
);

// ─── Save & Continue Drafts ──────────────────────────────
// Lets visitors pause mid-form and resume later via a secret resume token
// embedded in a shareable link (?draft=<token>). Answers are stored as the
// raw client-side values and re-played into the renderer on resume.

export const formDraftsTable = pgTable(
  "form_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => formsTable.id, { onDelete: "cascade" }),
    resumeToken: varchar("resume_token", { length: 128 }).notNull().unique(),
    answers: jsonb("answers").$type<Record<string, unknown>>().default({}),
    currentStep: integer("current_step").default(0).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
  },
  (table) => [
    index("form_drafts_form_id_idx").on(table.formId),
    index("form_drafts_resume_token_idx").on(table.resumeToken),
  ],
);

// ─── Form Versions ─────────────────────────────────────────

export type FormVersionField = {
  id: string;
  type: string;
  label: string;
  placeholder: string | null;
  helpText: string | null;
  required: boolean;
  order: number;
  validationRules: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    amount?: number;
    currency?: string;
  } | null;
  conditionalLogic: {
    showIf?: {
      fieldId: string;
      operator:
        | "equals"
        | "not_equals"
        | "contains"
        | "greater_than"
        | "less_than";
      value: string | number | boolean;
    };
  } | null;
  options: { label: string; value: string; order: number }[] | null;
};

export const formVersionsTable = pgTable(
  "form_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => formsTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    label: varchar("label", { length: 255 }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    themeId: uuid("theme_id"),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
    fields: jsonb("fields").$type<FormVersionField[]>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("form_versions_form_id_idx").on(table.formId),
    uniqueIndex("form_versions_form_version_idx").on(
      table.formId,
      table.version,
    ),
  ],
);

// ─── Themes ───────────────────────────────────────────────

export type ThemeBackground =
  | { type: "solid"; color: string }
  | { type: "gradient"; from: string; to: string }
  | { type: "image"; url: string };

export const themesTable = pgTable("themes", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").references(() => usersTable.id, {
    onDelete: "cascade",
  }),
  name: varchar("name", { length: 100 }).notNull(),
  category: themeCategoryEnum("category").default("community").notNull(),
  font: varchar("font", { length: 100 }),
  colors: jsonb("colors")
    .$type<{
      primary: string;
      background: string;
      surface: string;
      text: string;
    }>()
    .notNull(),
  background: jsonb("background").$type<ThemeBackground>(),
});

// ─── Fields ───────────────────────────────────────────────

export const fieldsTable = pgTable(
  "fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => formsTable.id, { onDelete: "cascade" }),
    type: fieldTypeEnum("type").notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    placeholder: varchar("placeholder", { length: 255 }),
    helpText: varchar("help_text", { length: 500 }),
    required: boolean("required").default(false).notNull(),
    order: integer("order").notNull(),
    validationRules: jsonb("validation_rules")
      .$type<{
        minLength?: number;
        maxLength?: number;
        min?: number;
        max?: number;
        pattern?: string;
        maxSize?: number;
        allowedTypes?: string[];
        /* Payment field (amount in whole rupees, currency like "INR"). */
        amount?: number;
        currency?: string;
      }>()
      .default({}),
    conditionalLogic: jsonb("conditional_logic")
      .$type<{
        showIf?: {
          fieldId: string;
          operator:
            | "equals"
            | "not_equals"
            | "contains"
            | "greater_than"
            | "less_than";
          value: string | number | boolean;
        };
        groups?: {
          id: string;
          all: boolean;
          conditions: {
            fieldId: string;
            operator:
              | "equals"
              | "not_equals"
              | "contains"
              | "greater_than"
              | "less_than";
            value: string | number | boolean;
          }[];
        }[];
        gotoPageId?: string;
        gotoSubmit?: boolean;
      }>()
      .default({}),
  },
  (table) => [
    index("fields_form_id_idx").on(table.formId),
    index("fields_form_id_order_idx").on(table.formId, table.order),
  ],
);

// ─── Field Options ────────────────────────────────────────

export const fieldOptionsTable = pgTable(
  "field_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fieldsTable.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 255 }).notNull(),
    value: varchar("value", { length: 255 }).notNull(),
    order: integer("order").notNull(),
  },
  (table) => [
    index("field_options_field_id_idx").on(table.fieldId),
    index("field_options_field_id_order_idx").on(table.fieldId, table.order),
  ],
);

// ─── Responses ────────────────────────────────────────────

export const responsesTable = pgTable(
  "responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => formsTable.id, { onDelete: "cascade" }),
    submittedAt: timestamp("submitted_at").defaultNow().notNull(),
    ipHash: varchar("ip_hash", { length: 64 }),
    completedInSeconds: integer("completed_in_seconds"),
    device: varchar("device", { length: 20 }),
    browser: varchar("browser", { length: 20 }),
  },
  (table) => [
    index("responses_form_id_idx").on(table.formId),
    index("responses_submitted_at_idx").on(table.submittedAt),
    index("responses_ip_hash_idx").on(table.ipHash),
  ],
);

// ─── Answers ──────────────────────────────────────────────

export const answersTable = pgTable(
  "answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => responsesTable.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fieldsTable.id, { onDelete: "cascade" }),
    value: jsonb("value").$type<
      string | number | boolean | string[] | FileAnswer | PaymentAnswer
    >(),
  },
  (table) => [
    index("answers_response_id_idx").on(table.responseId),
    index("answers_field_id_idx").on(table.fieldId),
    uniqueIndex("answers_response_field_idx").on(
      table.responseId,
      table.fieldId,
    ),
  ],
);

// ─── Payments (Razorpay) ─────────────────────────────────
// Tracks a Razorpay order for a payment field. A row is created when a
// visitor opens checkout and is marked "paid" once the signature verifies
// on submission. Webhooks keep status in sync (captured/refunded/failed).

export type PaymentAnswer = {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  status: "paid" | "refunded";
};

export const formPaymentsTable = pgTable(
  "form_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => formsTable.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fieldsTable.id, { onDelete: "cascade" }),
    responseId: uuid("response_id").references(() => responsesTable.id, {
      onDelete: "set null",
    }),
    razorpayOrderId: varchar("razorpay_order_id", { length: 255 })
      .notNull()
      .unique(),
    razorpayPaymentId: varchar("razorpay_payment_id", { length: 255 }),
    amountPaise: integer("amount_paise").notNull(),
    currency: varchar("currency", { length: 3 }).default("INR").notNull(),
    status: paymentStatusEnum("status").default("created").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    paidAt: timestamp("paid_at"),
  },
  (table) => [
    index("form_payments_form_id_idx").on(table.formId),
    index("form_payments_field_id_idx").on(table.fieldId),
    index("form_payments_order_id_idx").on(table.razorpayOrderId),
    index("form_payments_status_idx").on(table.status),
  ],
);

// ─── Form Views ───────────────────────────────────────────

export const formViewsTable = pgTable(
  "form_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => formsTable.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at").defaultNow().notNull(),
    device: varchar("device", { length: 20 }),
    browser: varchar("browser", { length: 20 }),
  },
  (table) => [
    index("form_views_form_id_idx").on(table.formId),
    index("form_views_viewed_at_idx").on(table.viewedAt),
  ],
);

// ─── File Uploads ─────────────────────────────────────────
// Files are stored on disk (server uploads dir); this table tracks metadata
// and maps the stored filename back to a safe download name.
//
// An upload starts orphaned (`response_id` null) and is claimed by the
// submission that references it. Rows still null after the grace period are
// swept: they are abandoned by the visitor or the submission never arrived.

export type FileAnswer = {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
};

export const formFileUploadsTable = pgTable(
  "form_file_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => formsTable.id, { onDelete: "cascade" }),
    /** Field the upload was made for; null once that field is deleted. */
    fieldId: uuid("field_id").references(() => fieldsTable.id, {
      onDelete: "set null",
    }),
    /** Null while the upload is unclaimed. An orphan is swept after a grace period. */
    responseId: uuid("response_id").references(() => responsesTable.id, {
      onDelete: "set null",
    }),
    storedName: text("stored_name").notNull().unique(),
    originalName: text("original_name").notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    size: integer("size").notNull(),
    /** Salted hash of the uploader's IP, matching how responses store theirs. */
    uploadedByIpHash: varchar("uploaded_by_ip_hash", { length: 64 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("form_file_uploads_form_id_idx").on(table.formId),
    index("form_file_uploads_field_id_idx").on(table.fieldId),
    index("form_file_uploads_response_id_idx").on(table.responseId),
    index("form_file_uploads_created_at_idx").on(table.createdAt),
  ],
);

// ─── Webhooks ─────────────────────────────────────────────
// Fire-and-forget HTTP callbacks on form events. `secret` (when set) HMAC
// signs the payload so the receiver can verify authenticity.

export const formWebhooksTable = pgTable(
  "form_webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => formsTable.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret"),
    events: jsonb("events").$type<string[]>().default(["response.created"]),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastStatus: integer("last_status"),
    lastError: text("last_error"),
    lastTriggeredAt: timestamp("last_triggered_at"),
    /** When the signing secret was last replaced; null if never rotated. */
    secretRotatedAt: timestamp("secret_rotated_at"),
    /** Consecutive failed deliveries, reset on any success. */
    consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
    /** Set when the hook was switched off automatically after repeated failure. */
    autoDisabledAt: timestamp("auto_disabled_at"),
    autoDisabledReason: text("auto_disabled_reason"),
  },
  (table) => [
    index("form_webhooks_form_id_idx").on(table.formId),
  ],
);

// ─── Webhook Deliveries ────────────────────────────────────
// One row per delivery attempt batch for a single event. The body is stored
// verbatim because it is exactly what the receiver saw (and what the HMAC was
// computed over) — replaying a retry must send byte-identical JSON or the
// receiver's signature check fails.
//
// `status` mirrors the lifecycle:
//   pending  → queued, awaiting the worker (or the first inline attempt)
//   success  → receiver answered 2xx
//   retrying → failed but still has attempts left, nextRetryAt is set
//   dead     → exhausted, or failed with a status that must not be retried
export const formWebhookDeliveriesTable = pgTable(
  "form_webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => formWebhooksTable.id, { onDelete: "cascade" }),
    event: varchar("event", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).$type<WebhookDeliveryStatus>()
      .default("pending")
      .notNull(),
    /** The exact JSON delivered, so a retry reproduces the same signature. */
    requestBody: jsonb("request_body").$type<Record<string, unknown>>().notNull(),
    /** Snapshot of the destination at enqueue time, for debugging DNS drift. */
    url: text("url").notNull(),
    responseStatus: integer("response_status"),
    /** Truncated receiver body; enough to diagnose, bounded to avoid bloat. */
    responseBody: text("response_body"),
    error: text("error"),
    durationMs: integer("duration_ms"),
    /** 1 on the first try, incremented by each retry. */
    attempt: integer("attempt").default(1).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    nextRetryAt: timestamp("next_retry_at"),
    /** Set when a manual redelivery supersedes the stored body. */
    isTest: boolean("is_test").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("form_webhook_deliveries_webhook_id_idx").on(table.webhookId),
    index("form_webhook_deliveries_created_at_idx").on(table.createdAt),
    // The worker's claim query filters on this, so it carries the partial
    // predicate rather than scanning settled deliveries.
    index("form_webhook_deliveries_pending_idx")
      .on(table.nextRetryAt)
      .where(sql`${table.status} IN ('pending', 'retrying')`),
  ],
);


// ─── Types ────────────────────────────────────────────────

export type SelectForm = typeof formsTable.$inferSelect;
export type InsertForm = typeof formsTable.$inferInsert;
export type SelectTheme = typeof themesTable.$inferSelect;
export type InsertTheme = typeof themesTable.$inferInsert;
export type SelectField = typeof fieldsTable.$inferSelect;
export type InsertField = typeof fieldsTable.$inferInsert;
export type SelectFieldOption = typeof fieldOptionsTable.$inferSelect;
export type InsertFieldOption = typeof fieldOptionsTable.$inferInsert;
export type SelectResponse = typeof responsesTable.$inferSelect;
export type InsertResponse = typeof responsesTable.$inferInsert;
export type SelectAnswer = typeof answersTable.$inferSelect;
export type InsertAnswer = typeof answersTable.$inferInsert;
export type SelectFormView = typeof formViewsTable.$inferSelect;
export type InsertFormView = typeof formViewsTable.$inferInsert;
export type SelectFormPayment = typeof formPaymentsTable.$inferSelect;
export type InsertFormPayment = typeof formPaymentsTable.$inferInsert;
export type SelectFormVersion = typeof formVersionsTable.$inferSelect;
export type InsertFormVersion = typeof formVersionsTable.$inferInsert;
export type SelectDomainVerification =
  typeof domainVerificationsTable.$inferSelect;
export type InsertDomainVerification =
  typeof domainVerificationsTable.$inferInsert;
export type SelectFormWebhook = typeof formWebhooksTable.$inferSelect;
export type InsertFormWebhook = typeof formWebhooksTable.$inferInsert;
export type SelectFormWebhookDelivery =
  typeof formWebhookDeliveriesTable.$inferSelect;
export type InsertFormWebhookDelivery =
  typeof formWebhookDeliveriesTable.$inferInsert;
export type WebhookDeliveryStatus =
  | "pending"
  | "success"
  | "retrying"
  | "dead";
export type WebhookDelivery = SelectFormWebhookDelivery;
export type SelectFormFileUpload = typeof formFileUploadsTable.$inferSelect;
export type InsertFormFileUpload = typeof formFileUploadsTable.$inferInsert;
export type SelectFormDraft = typeof formDraftsTable.$inferSelect;
export type InsertFormDraft = typeof formDraftsTable.$inferInsert;
