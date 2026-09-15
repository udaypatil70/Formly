import { useParams, useSearchParams } from "react-router-dom";
import { Loader2Icon } from "lucide-react";

import { PublicFormShell } from "~/components/public/public-form-shell";
import { trpc } from "~/trpc/client";
import type { PublicFormData } from "~/components/public/types";

export function PublicFormPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const password = searchParams.get("password") ?? undefined;

  const data = trpc.public.getFormBySlug.useQuery(
    { slug: slug ?? "", password },
    { enabled: !!slug },
  );

  if (!slug || data.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data.isError || !data.data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2">
        <p className="text-muted-foreground text-sm">
          This form could not be found.
        </p>
        <a className="text-sm underline" href="/">
          Go home
        </a>
      </main>
    );
  }

  const form: PublicFormData = {
    title: data.data.title,
    description: data.data.description ?? null,
    requiresPassword: data.data.requiresPassword,
    theme: data.data.theme
      ? {
          colors: data.data.theme.colors,
        }
      : null,
    fields: data.data.fields.map((f) => ({
      id: f.id,
      type: f.type,
      label: f.label,
      placeholder: f.placeholder ?? null,
      helpText: f.helpText ?? null,
      required: f.required,
      validationRules:
        f.validationRules && Object.keys(f.validationRules).length > 0
          ? (f.validationRules as never)
          : undefined,
      conditionalLogic:
        f.conditionalLogic && Object.keys(f.conditionalLogic).length > 0
          ? (f.conditionalLogic as never)
          : undefined,
      options: f.options?.map((o) => ({ value: o.value, label: o.label })),
    })),
  };

  return (
    <main className="min-h-screen">
      <PublicFormShell form={form} slug={data.data.slug} password={password} />
    </main>
  );
}