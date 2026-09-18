import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { AlertTriangleIcon, LockOpenIcon } from "lucide-react";

import { PasswordGate } from "~/components/public/password-gate";
import { PublicFormShell } from "~/components/public/public-form-shell";
import type { PublicFormData, PublicTheme } from "~/components/public/types";
import { Spinner } from "~/components/ui/spinner";
import { trpc } from "~/trpc/client";
import { backgroundStyle, fontFamilyFor } from "~/lib/theme-utils";

export function PublicFormPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const passwordParam = searchParams.get("password") ?? undefined;
  const isEmbed = searchParams.get("embed") === "1";

  const [password, setPassword] = useState<string | undefined>(passwordParam);
  const [passwordDraft, setPasswordDraft] = useState("");

  const data = trpc.public.getFormBySlug.useQuery(
    { slug: slug ?? "", password },
    { enabled: !!slug },
  );

  // Auto-resize the parent iframe when the form is embedded.
  useEffect(() => {
    if (!isEmbed || !window.parent || window.parent === window) return;
    const post = () => {
      window.parent.postMessage(
        { __formforgeHeight: document.body.scrollHeight },
        "*",
      );
    };
    post();
    const observer = new ResizeObserver(post);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [isEmbed]);

  if (!slug || data.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  const goHome = () =>
    isEmbed ? null : (
      <a className="text-sm underline" href="/">
        Go home
      </a>
    );

  if (data.isError || !data.data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2">
        <p className="text-muted-foreground text-sm">
          This form could not be found.
        </p>
        {goHome()}
      </main>
    );
  }

  const d = data.data;
  const theme: PublicTheme | null = d.theme
    ? {
        colors: d.theme.colors,
        font: d.theme.font ?? null,
        background: d.theme.background ?? null,
      }
    : null;

  if (d.blocked === "expired" || d.blocked === "limit_reached") {
    const expired = d.blocked === "expired";
    return (
      <main className="min-h-screen">
        <div
          style={{
            ...backgroundStyle(theme),
            color: theme?.colors.text ?? "#fafafa",
            fontFamily: fontFamilyFor(theme?.font),
            minHeight: "100%",
          }}
        >
          <div className="mx-auto flex w-full max-w-xl flex-col px-4 py-16">
            <div
              className="rounded-2xl border p-6 text-center sm:p-8"
              style={{
                backgroundColor: theme?.colors.surface ?? "#18181b",
                borderColor: `${theme?.colors.text ?? "#fafafa"}1f`,
              }}
            >
              <div
                className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-500"
              >
                {expired ? (
                  <LockOpenIcon className="size-5" />
                ) : (
                  <AlertTriangleIcon className="size-5" />
                )}
              </div>
              <h1 className="text-2xl font-bold">
                {expired
                  ? "This form has expired"
                  : "This form has reached its response limit"}
              </h1>
              <p className="mt-3 text-sm opacity-80">
                {expired
                  ? "The owner closed this form on "
                  : "No more responses are being accepted for this form."}
                {expired && d.settings?.expiry
                  ? new Date(d.settings.expiry).toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })
                  : null}
              </p>
              <div className="mt-6">{goHome()}</div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (d.locked) {
    return (
      <main className="min-h-screen">
        <PasswordGate
          title={d.title}
          description={d.description ?? null}
          theme={theme}
          incorrectPassword={d.incorrectPassword}
          value={passwordDraft}
          onValueChange={setPasswordDraft}
          onUnlock={(pw) => {
            setPassword(pw);
          }}
        />
      </main>
    );
  }

  const form: PublicFormData = {
    title: d.title,
    description: d.description ?? null,
    requiresPassword: d.requiresPassword,
    settings: d.settings?.thankYouMessage || d.settings?.stepMode
      ? {
          thankYouMessage: d.settings.thankYouMessage ?? undefined,
          stepMode: d.settings.stepMode,
        }
      : undefined,
    theme,
    fields: d.fields.map((f) => ({
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
      <PublicFormShell form={form} slug={d.slug} password={password} />
    </main>
  );
}