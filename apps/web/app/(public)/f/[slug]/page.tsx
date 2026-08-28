import { notFound } from "next/navigation";

import { PublicFormShell } from "~/components/public/public-form-shell";
import { api } from "~/trpc/server";
import type { PublicFormData } from "~/components/public/types";

export const dynamic = "force-dynamic";

interface PublicFormPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ password?: string }>;
}

export default async function PublicFormPage({
  params,
  searchParams,
}: PublicFormPageProps) {
  const { slug } = await params;
  const { password } = await searchParams;

  let data;
  try {
    data = await api.public.getFormBySlug.query({ slug, password });
  } catch {
    notFound();
  }

  const form: PublicFormData = {
    title: data.title,
    description: data.description ?? null,
    requiresPassword: data.requiresPassword,
    theme: data.theme
      ? {
          colors: data.theme.colors,
        }
      : null,
    fields: data.fields.map((f) => ({
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
      <PublicFormShell form={form} slug={data.slug} password={password} />
    </main>
  );
}
