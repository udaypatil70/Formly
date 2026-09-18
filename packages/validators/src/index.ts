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
]);
export type FieldType = z.infer<typeof FieldType>;

// ─── Validation Rules ─────────────────────────────────────

export const ValidationRulesSchema = z
  .object({
    minLength: z.number().int().positive().optional(),
    maxLength: z.number().int().positive().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    maxSize: z.number().int().positive().optional(),
    allowedTypes: z.array(z.string().max(50)).max(20).optional(),
    minLabel: z.string().max(100).optional(),
    maxLabel: z.string().max(100).optional(),
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
      expiry: z.string().optional(),
      responseLimit: z.number().int().positive().optional(),
      stepMode: z.enum(["page", "question"]).optional(),
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
  settings: z
    .object({
      password: z.string().min(1).optional(),
      expiry: z.string().optional(),
      responseLimit: z.number().int().positive().optional(),
      thankYouMessage: z.string().max(2000).optional(),
      stepMode: z.enum(["page", "question"]).optional(),
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
  name: z.string(),
  size: z.number().int().nonnegative(),
  mimeType: z.string(),
  url: z.string(),
});
export type FileAnswerValue = z.infer<typeof FileAnswerValueSchema>;

export const AnswerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  FileAnswerValueSchema,
]);
export type AnswerValue = z.infer<typeof AnswerValueSchema>;

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
      let s = z.string();
      if (field.validationRules?.minLength !== undefined)
        s = s.min(field.validationRules.minLength);
      if (field.validationRules?.maxLength !== undefined)
        s = s.max(field.validationRules.maxLength);
      if (field.validationRules?.pattern)
        s = s.regex(new RegExp(field.validationRules.pattern));
      validator = s;
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
      validator = z.object({
        fileId: z.string().uuid(),
        name: z.string(),
        size: z.number().int().nonnegative(),
        mimeType: z.string(),
        url: z.string(),
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
