import { useRef, useState } from "react";
import { toast } from "sonner";

import { trpc } from "~/trpc/client";
import { storeEditToken } from "~/lib/visitor";
import { PublicForm, type SubmissionMeta } from "./public-form";
import type { PaidPayment } from "./public-form";
import type { PublicFormData } from "./types";

interface PublicFormShellProps {
  form: PublicFormData;
  slug: string;
  password?: string;
  onPaymentsChange?: (payments: PaidPayment[]) => void;
  previewMode?: boolean;
  formTitle?: string;
  initialValues?: Record<string, unknown>;
  initialStep?: number;
  draftToken?: string;
  onDraftToken?: (token: string) => void;
  onDraftDeleted?: () => void;
  showSaveDraft?: boolean;
  /** When set, the form updates this existing response instead of creating one. */
  editToken?: string;
}

export function PublicFormShell({
  form,
  slug,
  password,
  onPaymentsChange,
  previewMode = false,
  initialValues,
  initialStep,
  draftToken,
  onDraftToken,
  onDraftDeleted,
  showSaveDraft = false,
  editToken: initialEditToken,
}: PublicFormShellProps) {
  const startRef = useRef<number>(Date.now());
  const [editToken, setEditToken] = useState<string | undefined>(
    initialEditToken,
  );

  const submit = trpc.public.submitResponse.useMutation({
    onError: (err) => {
      toast.error(err.message ?? "Failed to submit response");
    },
  });
  const update = trpc.public.updateOwnResponse.useMutation({
    onError: (err) => {
      toast.error(err.message ?? "Failed to update response");
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

    if (initialEditToken) {
      await update.mutateAsync({
        slug,
        password,
        token: initialEditToken,
        completedInSeconds,
        answers: values,
        turnstileToken: meta?.turnstileToken,
      });
      return;
    }

    const result = await submit.mutateAsync({
      slug,
      password,
      completedInSeconds,
      answers: values,
      honeypot: meta?.honeypot,
      turnstileToken: meta?.turnstileToken,
      payments: meta?.payments,
    });

    if (result.editToken) {
      storeEditToken(slug, result.editToken);
      setEditToken(result.editToken);
    }
  };

  return (
    <PublicForm
      form={form}
      onSubmit={handleSubmit}
      slug={slug}
      password={password}
      onPaymentsChange={onPaymentsChange}
      previewMode={previewMode}
      initialValues={initialValues}
      initialStep={initialStep}
      draftToken={draftToken}
      onDraftToken={onDraftToken}
      onDraftDeleted={onDraftDeleted}
      showSaveDraft={showSaveDraft}
      editToken={editToken}
      editMode={Boolean(initialEditToken)}
    />
  );
}
