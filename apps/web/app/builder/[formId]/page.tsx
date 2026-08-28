import { redirect } from "next/navigation";

import { FormBuilder, type FormBuilderMeta } from "~/components/builder/form-builder";
import type { BuilderField, BuilderTheme } from "~/lib/builder-types";
import { api } from "~/trpc/server";

export const dynamic = "force-dynamic";

interface BuilderPageProps {
  params: Promise<{ formId: string }>;
}

export default async function BuilderPage({ params }: BuilderPageProps) {
  const { formId } = await params;

  let detail;
  try {
    detail = await api.form.getById.query({ id: formId });
  } catch {
    redirect("/");
  }

  const meta: FormBuilderMeta = {
    id: detail.form.id,
    title: detail.form.title,
    description: detail.form.description ?? null,
    slug: detail.form.slug,
    status: detail.form.status,
    visibility: detail.form.visibility,
    themeId: detail.form.themeId ?? null,
  };

  const fields: BuilderField[] = (detail.fields ?? []).map((f) => ({
    id: f.id,
    formId: f.formId,
    type: f.type,
    label: f.label,
    placeholder:
      f.placeholder && f.placeholder.trim() !== "" ? f.placeholder : null,
    helpText: f.helpText && f.helpText.trim() !== "" ? f.helpText : null,
    required: f.required,
    order: f.order,
    validationRules:
      f.validationRules && Object.keys(f.validationRules).length > 0
        ? f.validationRules
        : undefined,
    conditionalLogic:
      f.conditionalLogic && Object.keys(f.conditionalLogic).length > 0
        ? f.conditionalLogic
        : undefined,
    options: f.options?.map((o) => ({
      id: o.id,
      label: o.label,
      value: o.value,
      order: o.order,
    })),
  }));

  const theme: BuilderTheme | null = detail.theme
    ? {
        id: detail.theme.id,
        name: detail.theme.name,
        category: detail.theme.category,
        colors: detail.theme.colors,
      }
    : null;

  return (
    <FormBuilder
      formId={formId}
      initialMeta={meta}
      initialFields={fields}
      initialTheme={theme}
    />
  );
}
