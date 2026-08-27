import { z } from "zod";

export const FieldType = z.enum([
  "short_text",
  "long_text",
  "email",
  "number",
  "single_select",
  "multi_select",
  "checkbox",
  "rating",
  "date",
]);
export type FieldType = z.infer<typeof FieldType>;

export const FieldSchema = z.object({
  id: z.string().uuid(),
  formId: z.string().uuid(),
  type: FieldType,
  label: z.string().min(1).max(255),
  placeholder: z.string().max(255).optional(),
  helpText: z.string().max(500).optional(),
  required: z.boolean().default(false),
  order: z.number().int().min(0),
  validationRules: z
    .object({
      minLength: z.number().int().positive().optional(),
      maxLength: z.number().int().positive().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().optional(),
    })
    .optional(),
  conditionalLogic: z
    .object({
      showIf: z
        .object({
          fieldId: z.string().uuid(),
          operator: z.enum([
            "equals",
            "not_equals",
            "contains",
            "greater_than",
            "less_than",
          ]),
          value: z.union([z.string(), z.number(), z.boolean()]),
        })
        .optional(),
    })
    .optional(),
  options: z
    .array(
      z.object({
        id: z.string().uuid(),
        label: z.string().min(1).max(255),
        value: z.string().min(1).max(255),
        order: z.number().int().min(0),
      }),
    )
    .optional(),
});
export type Field = z.infer<typeof FieldSchema>;

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
  themeId: z.string().uuid().optional(),
  settings: z
    .object({
      password: z.string().optional(),
      expiry: z.string().optional(),
      responseLimit: z.number().int().positive().optional(),
    })
    .optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});
export type Form = z.infer<typeof FormSchema>;

/**
 * Dynamically generates a Zod response schema from a form's field list.
 * This is the core function that powers:
 * - Frontend validation on the public form
 * - Backend validation on submission (tRPC input)
 * - Type-safe inference / auto-complete in the editor
 */
export function buildResponseSchema(fields: Field[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let fieldSchema: z.ZodTypeAny;

    switch (field.type) {
      case "short_text":
        fieldSchema = z.string();
        if (field.validationRules?.minLength !== undefined) {
          fieldSchema = (fieldSchema as z.ZodString).min(
            field.validationRules.minLength,
          );
        }
        if (field.validationRules?.maxLength !== undefined) {
          fieldSchema = (fieldSchema as z.ZodString).max(
            field.validationRules.maxLength,
          );
        }
        if (field.validationRules?.pattern) {
          fieldSchema = (fieldSchema as z.ZodString).regex(
            new RegExp(field.validationRules.pattern),
          );
        }
        break;

      case "long_text":
        fieldSchema = z.string();
        if (field.validationRules?.minLength !== undefined) {
          fieldSchema = (fieldSchema as z.ZodString).min(
            field.validationRules.minLength,
          );
        }
        if (field.validationRules?.maxLength !== undefined) {
          fieldSchema = (fieldSchema as z.ZodString).max(
            field.validationRules.maxLength,
          );
        }
        break;

      case "email":
        fieldSchema = z.string().email();
        break;

      case "number":
        fieldSchema = z.coerce.number();
        if (field.validationRules?.min !== undefined) {
          fieldSchema = (fieldSchema as z.ZodNumber).min(
            field.validationRules.min,
          );
        }
        if (field.validationRules?.max !== undefined) {
          fieldSchema = (fieldSchema as z.ZodNumber).max(
            field.validationRules.max,
          );
        }
        break;

      case "single_select":
        fieldSchema = field.options
          ? z.enum(field.options.map((o: { value: string }) => o.value) as [string, ...string[]])
          : z.string();
        break;

      case "multi_select":
        fieldSchema = field.options
          ? z
              .array(
                z.enum(
                  field.options.map((o: { value: string }) => o.value) as [string, ...string[]],
                ),
              )
              .min(1)
          : z.array(z.string()).min(1);
        break;

      case "checkbox":
        fieldSchema = z.boolean();
        break;

      case "rating":
        fieldSchema = z.number().int().min(1).max(5);
        break;

      case "date":
        fieldSchema = z.string().datetime();
        break;

      default:
        fieldSchema = z.string();
    }

    if (field.required) {
      fieldSchema = fieldSchema;
    } else {
      fieldSchema = fieldSchema.nullish();
    }

    shape[field.id] = fieldSchema;
  }

  return z.object(shape);
}

export type ResponseSchema = ReturnType<typeof buildResponseSchema>;
