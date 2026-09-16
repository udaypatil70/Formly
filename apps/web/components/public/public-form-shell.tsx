import { useRef } from "react";
import { toast } from "sonner";

import { trpc } from "~/trpc/client";
import { PublicForm, type SubmissionMeta } from "./public-form";
import type { PublicFormData } from "./types";

interface PublicFormShellProps {
  form: PublicFormData;
  slug: string;
  password?: string;
}

export function PublicFormShell({ form, slug, password }: PublicFormShellProps) {
  const startRef = useRef<number>(Date.now());

  const submit = trpc.public.submitResponse.useMutation({
    onError: (err) => {
      toast.error(err.message ?? "Failed to submit response");
    },
  });

  const handleSubmit = async (
    values: Record<string, unknown>,
    meta?: SubmissionMeta,
  ) => {
    const completedInSeconds = Math.max(
      1,
      Math.round((Date.now() - startRef.current) / 1000),
    );
    await submit.mutateAsync({
      slug,
      password,
      completedInSeconds,
      answers: values,
      honeypot: meta?.honeypot,
      turnstileToken: meta?.turnstileToken,
    });
  };

  return <PublicForm form={form} onSubmit={handleSubmit} />;
}
