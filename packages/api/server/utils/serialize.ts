import type {
  SelectField,
  SelectFieldOption,
  SelectForm,
  SelectTheme,
} from "@repo/db/schema";
import type { FieldOutput, FormOutput, ThemeOutput } from "./schemas";

export function serializeForm(
  form: SelectForm,
  overrides: Partial<Pick<SelectForm, "settings">> = {},
): FormOutput {
  const settings = overrides.settings ?? form.settings;
  return {
    ...form,
    description: form.description ?? null,
    themeId: form.themeId ?? null,
    settings: settings ?? {},
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt ? form.updatedAt.toISOString() : null,
  };
}

export function serializeTheme(theme: SelectTheme | null): ThemeOutput | null {
  if (!theme) return null;
  return theme;
}

export function serializeField(
  field: SelectField,
  options: SelectFieldOption[] = [],
): FieldOutput {
  const hasKeys = (obj: unknown) =>
    typeof obj === "object" && obj !== null && Object.keys(obj).length > 0;

  return {
    id: field.id,
    formId: field.formId,
    type: field.type,
    label: field.label,
    placeholder: field.placeholder ?? null,
    helpText: field.helpText ?? null,
    required: field.required,
    order: field.order,
    validationRules: hasKeys(field.validationRules)
      ? field.validationRules
      : undefined,
    conditionalLogic: hasKeys(field.conditionalLogic)
      ? field.conditionalLogic
      : undefined,
    options: options.length > 0 ? options.map((o) => o) : undefined,
  };
}