import { z } from "zod";

// ─── Field Type Enum ──────────────────────────────────────

export const FieldType = z.enum([
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
export type FieldType = z.infer<typeof FieldType>;

// ─── Validation Rules ─────────────────────────────────────

export const ValidationRulesSchema = z
  .object({
    minLength: z.number().int().positive().optional(),
    maxLength: z.number().int().positive().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().max(200).optional(),
    maxSize: z.number().int().positive().optional(),
    allowedTypes: z.array(z.string().max(50)).max(20).optional(),
    minLabel: z.string().max(100).optional(),
    maxLabel: z.string().max(100).optional(),
    amount: z
      .number()
      .int()
      .positive()
      .describe("Payment amount in whole rupees")
      .optional(),
    currency: z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/)
      .optional(),
  })
  .optional();
export type ValidationRules = z.infer<typeof ValidationRulesSchema>;

// ─── Conditional Logic ────────────────────────────────────

export const ConditionalRuleSchema = z.object({
  fieldId: z.string().uuid(),
  operator: z.enum([
    "equals",
    "not_equals",
    "contains",
    "greater_than",
    "less_than",
  ]),
  value: z.union([z.string(), z.number(), z.boolean()]),
});
export type ConditionalRule = z.infer<typeof ConditionalRuleSchema>;

export const ConditionalGroupSchema = z.object({
  id: z.string().uuid(),
  /** true = AND (every condition), false = OR (any condition). */
  all: z.boolean().default(true),
  conditions: z.array(ConditionalRuleSchema).min(1),
});
export type ConditionalGroup = z.infer<typeof ConditionalGroupSchema>;

export const ConditionalLogicSchema = z
  .object({
    showIf: ConditionalRuleSchema.optional(),
    groups: z.array(ConditionalGroupSchema).optional(),
    /** When the field is answered, jump to the page starting at this page-break. */
    gotoPageId: z.string().uuid().optional(),
    /** When the field is answered, submit the form immediately. */
    gotoSubmit: z.boolean().optional(),
  })
  .optional();
export type ConditionalLogic = z.infer<typeof ConditionalLogicSchema>;

/**
 * Evaluates one visibility rule against the answers collected so far.
 * Shared by the renderer and the submission endpoint so a crafted request
 * cannot use a different interpretation than the browser.
 */
export function evaluateConditionalRule(
  rule: ConditionalRule,
  answers: Record<string, unknown>,
): boolean {
  const sourceValue = answers[rule.fieldId];
  switch (rule.operator) {
    case "equals":
      return sourceValue === rule.value;
    case "not_equals":
      return sourceValue !== rule.value;
    case "contains":
      return Array.isArray(sourceValue)
        ? sourceValue.includes(rule.value as string)
        : String(sourceValue ?? "").includes(String(rule.value));
    case "greater_than":
      return Number(sourceValue) > Number(rule.value);
    case "less_than":
      return Number(sourceValue) < Number(rule.value);
    default:
      return true;
  }
}

/**
 * Whether `conditionalLogic` leaves a field visible for the given answers.
 * Mirrors the client's rendering rules exactly:
 * - `showIf` must pass (when present)
 * - when `groups` are configured, at least one group must match
 * - when neither is configured the field is always visible
 */
export function isFieldVisible(
  logic: ConditionalLogic | null | undefined,
  answers: Record<string, unknown>,
): boolean {
  if (!logic) return true;

  if (logic.showIf && !evaluateConditionalRule(logic.showIf, answers)) {
    return false;
  }

  const groups = logic.groups ?? [];
  if (groups.length === 0) return true;

  return groups.some((group) => {
    if (group.conditions.length === 0) return false;
    const results = group.conditions.map((condition) =>
      evaluateConditionalRule(condition, answers),
    );
    return group.all ? results.every(Boolean) : results.some(Boolean);
  });
}

/** Returns only the fields that are visible for `answers`. */
export function visibleFields<T extends { conditionalLogic?: ConditionalLogic | null }>(
  fields: T[],
  answers: Record<string, unknown>,
): T[] {
  return fields.filter((field) => isFieldVisible(field.conditionalLogic, answers));
}

// ─── Template Categories ────────────────────────────────
// Single source of truth shared by the DB enum (`template_category`), the
// template API filters and the frontend category picker.

export const TEMPLATE_CATEGORIES = [
  "feedback",
  "sales",
  "education",
  "health",
  "events",
  "product",
  "careers",
  "community",
  "it",
] as const;

export const TemplateCategory = z.enum(TEMPLATE_CATEGORIES);
export type TemplateCategory = z.infer<typeof TemplateCategory>;

// ─── URL Safety ───────────────────────────────────────────

/**
 * URL schemes that can execute script when placed in an `href`/`src`
 * (`javascript:`, `data:text/html`, `vbscript:`). These must never survive
 * into a rendered link, so every user-supplied URL is checked against this.
 */
const DANGEROUS_SCHEME = /^\s*(?:javascript|data|vbscript|blob|file):/i;

/**
 * Validates a URL that will be rendered as a link. Only `http(s)` is allowed,
 * which blocks `javascript:` and other script-executing schemes.
 */
export function safeHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || DANGEROUS_SCHEME.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Zod schema for a URL destined for an anchor href. */
export const SafeUrlSchema = z.string().refine(safeHttpUrl, {
  message: "URL must start with http:// or https://",
});

// ─── Field Option ─────────────────────────────────────────

export const FieldOptionSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(255),
  value: z.string().min(1).max(255),
  order: z.number().int().min(0),
});
export type FieldOption = z.infer<typeof FieldOptionSchema>;

// ─── Field Schema (full, as stored in DB) ─────────────────

export const FieldSchema = z.object({
  id: z.string().uuid(),
  formId: z.string().uuid(),
  type: FieldType,
  label: z.string().min(1).max(255),
  placeholder: z.string().max(255).optional(),
  helpText: z.string().max(500).optional(),
  required: z.boolean().default(false),
  order: z.number().int().min(0),
  validationRules: ValidationRulesSchema,
  conditionalLogic: ConditionalLogicSchema,
  options: z.array(FieldOptionSchema).optional(),
});
export type Field = z.infer<typeof FieldSchema>;

// ─── Form Schema (full, as stored in DB) ──────────────────

export const FormSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase alphanumeric with hyphens",
    ),
  status: z.enum(["draft", "published", "unpublished"]),
  visibility: z.enum(["public", "unlisted"]),
  archived: z.boolean().default(false),
  themeId: z.string().uuid().nullable().optional(),
  settings: z
    .object({
      password: z.string().optional(),
      expiry: z.string().nullish(),
      opensAt: z.string().nullish(),
      closesAt: z.string().nullish(),
      responseTarget: z.number().int().positive().nullish(),
      responseLimit: z.number().int().positive().nullish(),
      closeMessage: z.string().max(2000).nullish(),
      allowMultipleResponses: z.boolean().optional(),
      allowResponseEditing: z.boolean().optional(),
      stepMode: z.enum(["all", "page", "question"]).optional(),
      notifyOnResponse: z.boolean().optional(),
      notificationEmail: z.string().optional(),
      sendConfirmation: z.boolean().optional(),
      confirmationEmailFieldId: z.string().uuid().optional(),
      startScreen: z
        .object({
          enabled: z.boolean(),
          title: z.string().max(255).optional(),
          description: z.string().max(500).optional(),
          buttonLabel: z.string().max(100).optional(),
        })
        .optional(),
      endScreen: z
        .object({
          enabled: z.boolean(),
          title: z.string().max(255).optional(),
          message: z.string().max(2000).optional(),
          buttonLabel: z.string().max(100).optional(),
        })
        .optional(),
    })
    .optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});
export type Form = z.infer<typeof FormSchema>;

// ─── Input Schemas (tRPC procedures) ──────────────────────

export const CreateFieldInput = z.object({
  type: FieldType,
  label: z.string().min(1).max(255),
  placeholder: z.string().max(255).optional(),
  helpText: z.string().max(500).optional(),
  required: z.boolean().default(false),
  order: z.number().int().min(0),
  validationRules: ValidationRulesSchema,
  conditionalLogic: ConditionalLogicSchema,
  options: z
    .array(
      z.object({
        label: z.string().min(1).max(255),
        value: z.string().min(1).max(255),
        order: z.number().int().min(0),
      }),
    )
    .optional(),
});
export type CreateFieldInput = z.infer<typeof CreateFieldInput>;

export const UpdateFieldInput = CreateFieldInput.partial().extend({
  id: z.string().uuid(),
  order: z.number().int().min(0).optional(),
});
export type UpdateFieldInput = z.infer<typeof UpdateFieldInput>;

export const CreateFormInput = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase alphanumeric with hyphens",
    ),
  visibility: z.enum(["public", "unlisted"]).default("public"),
  themeId: z.string().uuid().optional(),
  customDomain: z
    .string()
    .trim()
    .max(255)
    .nullable()
    .optional(),
  settings: z
    .object({
      password: z.string().min(1).optional(),
      expiry: z.string().nullish(),
      opensAt: z.string().nullish(),
      closesAt: z.string().nullish(),
      responseTarget: z.number().int().positive().nullish(),
      responseLimit: z.number().int().positive().nullish(),
      closeMessage: z.string().max(2000).nullish(),
      allowMultipleResponses: z.boolean().optional(),
      allowResponseEditing: z.boolean().optional(),
      thankYouMessage: z.string().max(2000).optional(),
      stepMode: z.enum(["all", "page", "question"]).optional(),
      notifyOnResponse: z.boolean().optional(),
      notificationEmail: z.string().email().optional(),
      sendConfirmation: z.boolean().optional(),
      confirmationEmailFieldId: z.string().uuid().optional(),
      startScreen: z
        .object({
          enabled: z.boolean(),
          title: z.string().max(255).optional(),
          description: z.string().max(500).optional(),
          buttonLabel: z.string().max(100).optional(),
        })
        .optional(),
      endScreen: z
        .object({
          enabled: z.boolean(),
          title: z.string().max(255).optional(),
          message: z.string().max(2000).optional(),
          buttonLabel: z.string().max(100).optional(),
        })
        .optional(),
    })
    .optional(),
  fields: z.array(CreateFieldInput).optional(),
});
export type CreateFormInput = z.infer<typeof CreateFormInput>;

export const UpdateFormInput = CreateFormInput.partial();
export type UpdateFormInput = z.infer<typeof UpdateFormInput>;

export const PublishFormInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["published", "unpublished"]),
});
export type PublishFormInput = z.infer<typeof PublishFormInput>;

// ─── Answer Value Types (per field type) ──────────────────

export const FileAnswerValueSchema = z.object({
  fileId: z.string().uuid(),
  name: z.string().max(255),
  size: z.number().int().nonnegative(),
  mimeType: z.string().max(255),
  url: SafeUrlSchema,
});
export type FileAnswerValue = z.infer<typeof FileAnswerValueSchema>;

export const PaymentAnswerValueSchema = z.object({
  paymentId: z.string().min(1),
  orderId: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  status: z.enum(["paid", "refunded"]),
});
export type PaymentAnswerValue = z.infer<typeof PaymentAnswerValueSchema>;

// ─── Currency minor units ──────────────────────────────────
// Razorpay, like most gateways, expects amounts in the currency's smallest
// unit. Most currencies use 2 decimals but several do not, so a blanket
// `amount * 100` silently overcharges (or undercharges) those.
// Shared by the API and the web client so checkout, ledger and refunds agree.

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

const THREE_DECIMAL_CURRENCIES = new Set([
  "BHD",
  "IQD",
  "JOD",
  "KWD",
  "LYD",
  "OMR",
  "TND",
]);

/** How many minor units make one whole unit of `currency`. */
export function currencyMinorUnitFactor(currency: string): number {
  const code = currency.trim().toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 1;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 1000;
  return 100;
}

/** Whole currency units → minor units (e.g. ₹499 → 49900 paise). */
export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * currencyMinorUnitFactor(currency));
}

/** Minor units → whole currency units (e.g. 49900 paise → ₹499). */
export function fromMinorUnits(amount: number, currency: string): number {
  return amount / currencyMinorUnitFactor(currency);
}

export const AnswerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  FileAnswerValueSchema,
  PaymentAnswerValueSchema,
]);
export type AnswerValue = z.infer<typeof AnswerValueSchema>;

// ─── Regex Safety ─────────────────────────────────────────

/** Hard ceiling on the string a user-supplied regex is ever tested against. */
const REGEX_INPUT_MAX = 10_000;

/**
 * Shapes that cause catastrophic backtracking, e.g. `(a+)+`, `(a|a)*`,
 * `(.*)*`. Rejecting them keeps a form owner's typo from becoming a
 * server-side denial of service on every submission.
 */
const CATASTROPHIC_PATTERN =
  /\((?:\?:)?[^()]*[+*}][^()]*\)\s*[+*]|\((?:\?:)?\|[^()]*\|[^()]*\)\s*[+*]|\(\.\*\)\s*[+*]|\(\.\+\)\s*[+*]/;

/**
 * Compiles an owner-supplied pattern, returning undefined when it is unsafe or
 * malformed. Callers fall back to a plain string check.
 */
function compileSafePattern(
  pattern: string,
): RegExp | undefined {
  if (pattern.length > 200) return undefined;
  if (CATASTROPHIC_PATTERN.test(pattern)) return undefined;
  try {
    return new RegExp(pattern);
  } catch {
    return undefined;
  }
}

/**
 * Zod schema for a text answer: bounded length, safe optional regex.
 * The upper bound also caps how much text a custom pattern has to scan.
 */
function buildTextValidator(rules?: ValidationRules): z.ZodTypeAny {
  const max = Math.min(rules?.maxLength ?? REGEX_INPUT_MAX, REGEX_INPUT_MAX);
  let s = z.string().max(max);
  if (rules?.minLength !== undefined) s = s.min(rules.minLength);
  if (rules?.pattern) {
    const re = compileSafePattern(rules.pattern);
    if (re) s = s.regex(re);
  }
  return s;
}

// ─── Dynamic Response Schema (core trick) ─────────────────

/**
 * Maps a single field type to its Zod validator.
 * Handles validationRules (minLength, maxLength, min, max, pattern).
 */
function buildFieldValidator(field: Field): z.ZodTypeAny {
  let validator: z.ZodTypeAny;

  switch (field.type) {
    case "short_text":
    case "long_text": {
      validator = buildTextValidator(field.validationRules);
      break;
    }

    case "email":
      validator = z.string().email();
      break;

    case "number": {
      let n = z.coerce.number();
      if (field.validationRules?.min !== undefined)
        n = n.min(field.validationRules.min);
      if (field.validationRules?.max !== undefined)
        n = n.max(field.validationRules.max);
      validator = n;
      break;
    }

    case "single_select":
    case "radio": {
      const values = field.options?.map((o: FieldOption) => o.value);
      validator =
        values && values.length > 0
          ? z.enum(values as [string, ...string[]])
          : z.string();
      break;
    }

    case "multi_select": {
      const values = field.options?.map((o: FieldOption) => o.value);
      validator =
        values && values.length > 0
          ? z.array(z.enum(values as [string, ...string[]])).min(1)
          : z.array(z.string()).min(1);
      break;
    }

    case "checkbox":
      validator = z.boolean();
      break;

    case "rating":
      validator = z.number().int().min(1).max(5);
      break;

    case "date":
      validator = z.string().date();
      break;

    case "phone":
      validator = z
        .string()
        .regex(/^[+]?[0-9\s\-().]{7,20}$/, "Invalid phone number")
        .trim();
      break;

    case "url":
      validator = z.string().url("Invalid URL");
      break;

    case "time": {
      validator = z
        .string()
        .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM format")
        .refine((t) => {
          if (field.validationRules?.min !== undefined) {
            return t >= String(field.validationRules.min);
          }
          return true;
        })
        .refine((t) => {
          if (field.validationRules?.max !== undefined) {
            return t <= String(field.validationRules.max);
          }
          return true;
        });
      break;
    }

    case "scale": {
      const min = field.validationRules?.min ?? 1;
      const max = field.validationRules?.max ?? 10;
      validator = z.number().int().min(min).max(max);
      break;
    }

    case "file_upload":
      validator = FileAnswerValueSchema;
      break;

    case "payment":
      validator = z.object({
        paymentId: z.string().min(1),
        orderId: z.string().min(1),
        amount: z.number().int().positive(),
        currency: z.string().length(3),
        status: z.enum(["paid", "refunded"]),
      });
      break;

    default:
      validator = z.string();
  }

  return field.required ? validator : validator.nullish();
}

/**
 * Dynamically generates a Zod response schema from a form's field list.
 * This is the core function that powers:
 * - Frontend validation on the public form
 * - Backend validation on submission (tRPC input)
 * - Required/optional enforcement
 * - Type-safe answers end-to-end
 *
 * @param fields - Array of fields with options already loaded
 * @returns Zod object schema keyed by field.id
 *
 * @example
 * const schema = buildResponseSchema(fields);
 * const result = schema.safeParse({ "field-1": "hello", "field-2": 42 });
 */
export function buildResponseSchema(fields: Field[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    if (field.type === "page_break") continue;
    shape[field.id] = buildFieldValidator(field);
  }

  return z.object(shape);
}

/**
 * Infers the TypeScript type of a response from a field list.
 * Use this to get type-safe answer objects without runtime overhead.
 *
 * @example
 * type MyResponse = InferResponseType<typeof fields>;
 * // { "field-1": string | null | undefined; "field-2": number | null | undefined; ... }
 */
export type InferResponseType<Fields extends Field[]> = z.infer<
  ReturnType<typeof buildResponseSchema>
>;

// ─── Response Input (for tRPC submission) ─────────────────

export const SubmitResponseInput = z.object({
  formId: z.string().uuid(),
  completedInSeconds: z.number().int().positive().optional(),
  answers: z.record(z.string().uuid(), AnswerValueSchema),
  honeypot: z.string().optional(),
  turnstileToken: z.string().optional(),
});
export type SubmitResponseInput = z.infer<typeof SubmitResponseInput>;

// ─── Webhook Events ───────────────────────────────────────
// Single source of truth shared by the API (filtering, payload building) and the
// builder UI (event picker, delivery log filters), so a hook can never
// subscribe to an event the delivery pipeline cannot emit.

export const WEBHOOK_EVENT_GROUPS = [
  {
    id: "responses",
    label: "Responses",
    events: [
      { value: "response.created", label: "Response submitted" },
      { value: "response.updated", label: "Response edited" },
    ],
  },
  {
    id: "payments",
    label: "Payments",
    events: [
      { value: "payment.paid", label: "Payment captured" },
      { value: "payment.refunded", label: "Payment refunded" },
    ],
  },
  {
    id: "form",
    label: "Form lifecycle",
    events: [
      { value: "form.published", label: "Form published" },
      { value: "form.unpublished", label: "Form unpublished" },
    ],
  },
  {
    id: "drafts",
    label: "Drafts",
    events: [{ value: "draft.saved", label: "Partial response saved" }],
  },
] as const;

export const WEBHOOK_EVENTS = [
  "response.created",
  "response.updated",
  "payment.paid",
  "payment.refunded",
  "form.published",
  "form.unpublished",
  "draft.saved",
] as const;

export const WebhookEvent = z.enum(WEBHOOK_EVENTS);
export type WebhookEvent = z.infer<typeof WebhookEvent>;

/** Wildcard stored alongside real events; a hook with it receives everything. */
export const WEBHOOK_EVENT_ALL = "*" as const;

/**
 * A hook's subscription list: real event names, or the wildcard.
 * Kept permissive on read because rows written before an event was typed here
 * may still hold names the pipeline no longer emits.
 */
export const WebhookEventList = z.array(z.string());

export function isWildcardEvent(events: readonly string[] | null | undefined) {
  return !!events?.includes(WEBHOOK_EVENT_ALL);
}

/** Whether a hook subscribed to `events` should fire for `event`. */
export function webhookSubscribesTo(
  events: readonly string[] | null | undefined,
  event: string,
) {
  if (!Array.isArray(events) || events.length === 0) {
    // A hook with no stored selection defaults to the original single-event
    // behaviour rather than silently receiving nothing.
    return event === "response.created";
  }
  return isWildcardEvent(events) || events.includes(event);
}

/**
 * Normalizes a requested subscription list into known events plus the
 * wildcard, dropping duplicates and anything the pipeline does not emit.
 */
export function normalizeWebhookEvents(input: readonly string[]) {
  const seen = new Set<string>();
  for (const raw of input) {
    const value = raw.trim();
    if (!value) continue;
    if (value === WEBHOOK_EVENT_ALL) {
      seen.add(WEBHOOK_EVENT_ALL);
      continue;
    }
    if ((WEBHOOK_EVENTS as readonly string[]).includes(value)) {
      seen.add(value);
    }
  }
  if (seen.size === 0) seen.add("response.created");
  return [...seen];
}
