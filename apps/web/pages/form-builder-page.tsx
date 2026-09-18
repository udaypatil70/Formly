import { useState } from "react";
import { useParams, Navigate } from "react-router-dom";

import { FormBuilder, type FormBuilderMeta } from "~/components/builder/form-builder";
import { Spinner } from "~/components/ui/spinner";
import type { BuilderField, BuilderTheme } from "~/lib/builder-types";
import { trpc } from "~/trpc/client";

export function FormBuilderPage() {
  const { formId } = useParams<{ formId: string }>();
  const [loadKey, setLoadKey] = useState(0);

  const detail = trpc.form.getById.useQuery(
    { id: formId ?? "" },
    { enabled: !!formId },
  );

  if (!formId || detail.isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return <Navigate to="/dashboard" replace />;
  }

  const meta: FormBuilderMeta = {
    id: detail.data.form.id,
    title: detail.data.form.title,
    description: detail.data.form.description ?? null,
    slug: detail.data.form.slug,
    status: detail.data.form.status,
    visibility: detail.data.form.visibility,
    themeId: detail.data.form.themeId ?? null,
    customDomain: detail.data.form.customDomain ?? null,
    settings: detail.data.form.settings ?? {},
  };

  const fields: BuilderField[] = (detail.data.fields ?? []).map((f) => ({
    id: f.id,
    formId: f.formId,
    type: f.type,
    label: f.label,
    placeholder: f.placeholder && f.placeholder.trim() !== "" ? f.placeholder : null,
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

  const theme: BuilderTheme | null = detail.data.theme
    ? {
        id: detail.data.theme.id,
        name: detail.data.theme.name,
        category: detail.data.theme.category,
        colors: detail.data.theme.colors,
        font: detail.data.theme.font ?? null,
        background: detail.data.theme.background ?? null,
      }
    : null;

  const handleVersionRestored = async () => {
    await detail.refetch();
    setLoadKey((k) => k + 1);
  };

  return (
    <FormBuilder
      key={loadKey}
      formId={formId}
      initialMeta={meta}
      initialFields={fields}
      initialTheme={theme}
      onVersionRestored={() => void handleVersionRestored()}
    />
  );
}