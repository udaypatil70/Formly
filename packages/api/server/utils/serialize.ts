import type { SelectForm, SelectTheme } from "@repo/db/schema";
import type { FormOutput, ThemeOutput } from "./schemas";

export function serializeForm(
  form: SelectForm,
  overrides: Partial<Pick<SelectForm, "settings">> = {},
): FormOutput {
  const settings = overrides.settings ?? form.settings;
  return {
    ...form,
    description: form.description ?? null,
    themeId: form.themeId ?? null,
    customDomainVerifiedAt: form.customDomainVerifiedAt
      ? form.customDomainVerifiedAt.toISOString()
      : null,
    settings: {
      ...(settings ?? {}),
      password: undefined,
      hasPassword: Boolean(settings?.password),
    },
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt ? form.updatedAt.toISOString() : null,
  };
}

export function serializeTheme(theme: SelectTheme | null): ThemeOutput | null {
  if (!theme) return null;
  return theme;
}
