import type { UpdateFieldInput } from "@repo/validators";

import type { BuilderField, BuilderTheme } from "~/lib/builder-types";
import type { FormBuilderMeta } from "./form-builder";
import type { PublicFormData, PublicField } from "~/components/public/types";

/**
 * Strips internal option ids before sending to the API (the API regenerates
 * option ids server-side when options are replaced).
 */
export function toUpdateInput(input: UpdateFieldInput): UpdateFieldInput {
  if (input.options) {
    return {
      ...input,
      options: input.options.map(({ label, value, order }) => ({
        label,
        value,
        order,
      })),
    };
  }
  return input;
}

/** Builds the shared public form data shape from live builder state. */
export function buildPublicForm(
  meta: FormBuilderMeta,
  fields: BuilderField[],
  theme: BuilderTheme | null,
): PublicFormData {
  const sorted = [...fields].sort((a, b) => a.order - b.order);

  const publicFields: PublicField[] = sorted.map((f) => ({
    id: f.id,
    type: f.type,
    label: f.label,
    placeholder: f.placeholder ?? null,
    helpText: f.helpText ?? null,
    required: f.required,
    validationRules:
      f.validationRules && Object.keys(f.validationRules).length > 0
        ? f.validationRules
        : undefined,
    conditionalLogic:
      f.conditionalLogic && Object.keys(f.conditionalLogic).length > 0
        ? f.conditionalLogic
        : undefined,
    options: f.options?.map((o) => ({ value: o.value, label: o.label })),
  }));

  return {
    title: meta.title,
    description: meta.description ?? null,
    requiresPassword: false,
    fields: publicFields,
    theme: theme
      ? { colors: theme.colors, font: theme.font ?? null, background: theme.background ?? null }
      : null,
    settings: meta.settings?.thankYouMessage || meta.settings?.stepMode
      ? {
          thankYouMessage: meta.settings.thankYouMessage,
          stepMode: meta.settings.stepMode,
        }
      : undefined,
  };
}
