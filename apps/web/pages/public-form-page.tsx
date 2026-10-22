import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangleIcon,
  Clock3Icon,
  LockOpenIcon,
  PencilIcon,
} from "lucide-react";

import { PasswordGate } from "~/components/public/password-gate";
import { PublicFormShell } from "~/components/public/public-form-shell";
import type { PublicFormData, PublicTheme } from "~/components/public/types";
import { Spinner } from "~/components/ui/spinner";
import { NotFoundPage } from "~/pages/not-found-page";
import { trpc } from "~/trpc/client";
import { backgroundStyle, fontFamilyFor } from "~/lib/theme-utils";
import { getStoredEditToken } from "~/lib/visitor";

export function PublicFormPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const passwordParam = searchParams.get("password") ?? undefined;
  const isEmbed = searchParams.get("embed") === "1";
  const draftParam = searchParams.get("draft") ?? undefined;
  const responseParam = searchParams.get("response") ?? undefined;

  const [password, setPassword] = useState<string | undefined>(passwordParam);
  const [passwordDraft, setPasswordDraft] = useState("");

  const hasSlug = !!slug;
  const hostname =
    typeof window !== "undefined" ? window.location.hostname : "";
  const usesCustomDomain = !hasSlug && !!hostname;

  const slugQuery = trpc.public.getFormBySlug.useQuery(
    { slug: slug ?? "", password, responseToken: responseParam },
    { enabled: hasSlug },
  );
  const domainQuery = trpc.public.resolveDomain.useQuery(
    { domain: hostname, password },
    { enabled: usesCustomDomain },
  );
  const data = hasSlug ? slugQuery : domainQuery;

  // Auto-resize the parent iframe when the form is embedded.
  useEffect(() => {
    if (!isEmbed || !window.parent || window.parent === window) return;
    const post = () => {
      window.parent.postMessage(
        { __formlyHeight: document.body.scrollHeight },
        "*",
      );
    };
    post();
    const observer = new ResizeObserver(post);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [isEmbed]);

  // Unlisted forms stay reachable by direct link but must not be indexed.
  const listed = data.data?.listed;
  useEffect(() => {
    if (listed !== false) return;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [listed]);

  if ((!slug && !usesCustomDomain) || data.isLoading) {
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
    // Mounted as the catch-all route so a custom domain serves its form from
    // any path. A host that resolves to nothing is therefore just an unknown
    // path on the app itself, which deserves the branded 404.
    if (!hasSlug) return <NotFoundPage />;
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

  if (d.blocked) {
    const notOpen = d.blocked === "not_open";
    const expired = d.blocked === "expired";
    const closeMessage = d.settings?.closeMessage?.trim();
    const scheduleDate = notOpen
      ? d.settings?.opensAt
      : (d.settings?.closesAt ?? d.settings?.expiry);
    const title = notOpen
      ? "This form isn't open yet"
      : expired
        ? "This form has closed"
        : d.blocked === "target_reached"
          ? "This form has reached its response target"
          : "This form has reached its response limit";
    const fallbackMessage = notOpen
      ? "The owner hasn't opened this form yet."
      : expired
        ? "The owner is no longer accepting responses."
        : "No more responses are being accepted for this form.";
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
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
                {notOpen ? (
                  <Clock3Icon className="size-5" />
                ) : expired ? (
                  <LockOpenIcon className="size-5" />
                ) : (
                  <AlertTriangleIcon className="size-5" />
                )}
              </div>
              <h1 className="text-2xl font-bold">{title}</h1>
              <p className="mt-3 text-sm opacity-80">
                {closeMessage || fallbackMessage}
                {!closeMessage && scheduleDate
                  ? ` ${
                      notOpen ? "It opens on " : "It closed on "
                    }${new Date(scheduleDate).toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}.`
                  : null}
              </p>
              <div className="mt-6">{goHome()}</div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (d.alreadySubmitted) {
    const storedToken = getStoredEditToken(d.slug);
    const editUrl = storedToken
      ? (() => {
          const url = new URL(window.location.href);
          url.searchParams.delete("draft");
          url.searchParams.set("response", storedToken);
          return url.toString();
        })()
      : null;
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
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
                <PencilIcon className="size-5" />
              </div>
              <h1 className="text-2xl font-bold">You&apos;ve already responded</h1>
              <p className="mt-3 text-sm opacity-80">
                This form only accepts one response per visitor.
                {d.settings?.allowResponseEditing !== false
                  ? " You can reopen your response with the edit link you received."
                  : null}
              </p>
              <div className="mt-6 flex flex-col items-center gap-3">
                {editUrl && d.settings?.allowResponseEditing !== false ? (
                  <a
                    href={editUrl}
                    className="rounded-md border px-4 py-2 text-sm font-medium"
                  >
                    Edit my response
                  </a>
                ) : null}
                {goHome()}
              </div>
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
    id: d.id,
    title: d.title,
    description: d.description ?? null,
    requiresPassword: d.requiresPassword,
    settings: d.settings
      ? {
          thankYouMessage: d.settings.thankYouMessage ?? undefined,
          stepMode: d.settings.stepMode,
          startScreen: d.settings.startScreen,
          endScreen: d.settings.endScreen,
          allowMultipleResponses: d.settings.allowMultipleResponses,
          allowResponseEditing: d.settings.allowResponseEditing,
          closeMessage: d.settings.closeMessage ?? undefined,
          opensAt: d.settings.opensAt ?? null,
          closesAt: d.settings.closesAt ?? null,
          expiry: d.settings.expiry ?? null,
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
    <FormStage
      form={form}
      slug={d.slug}
      password={password}
      draftParam={draftParam}
      responseParam={responseParam}
      isEmbed={isEmbed}
    />
  );
}

function FormStage({
  form,
  slug,
  password,
  draftParam,
  responseParam,
  isEmbed,
}: {
  form: PublicFormData;
  slug: string;
  password?: string;
  draftParam?: string;
  responseParam?: string;
  isEmbed: boolean;
}) {
  const [activeDraft, setActiveDraft] = useState(draftParam);
  const draftQuery = trpc.public.getDraft.useQuery(
    { slug, token: draftParam ?? "" },
    { enabled: !!draftParam && !responseParam },
  );
  const editQuery = trpc.public.getResponseForEdit.useQuery(
    { slug, password, token: responseParam ?? "" },
    { enabled: !!responseParam },
  );

  useEffect(() => {
    if (draftParam && draftQuery.isError) {
      const url = new URL(window.location.href);
      url.searchParams.delete("draft");
      window.history.replaceState({}, "", url.toString());
      setActiveDraft(undefined);
    }
  }, [draftParam, draftQuery.isError]);

  const updateDraftParam = (token: string) => {
    if (!token) return;
    setActiveDraft(token);
    const url = new URL(window.location.href);
    if (url.searchParams.get("draft") === token) return;
    url.searchParams.set("draft", token);
    window.history.replaceState({}, "", url.toString());
  };

  const clearDraft = () => {
    setActiveDraft(undefined);
    const url = new URL(window.location.href);
    url.searchParams.delete("draft");
    window.history.replaceState({}, "", url.toString());
  };

  if (
    (!!draftParam && draftQuery.isLoading) ||
    (!!responseParam && editQuery.isLoading)
  ) {
    return (
      <main className="min-h-screen">
        <div className="flex min-h-screen items-center justify-center">
          <Spinner className="size-6 text-muted-foreground" />
        </div>
      </main>
    );
  }

  if (responseParam && editQuery.isError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2">
        <p className="text-sm text-muted-foreground">
          This edit link is invalid or has expired.
        </p>
        <a className="text-sm underline" href={`/form/${slug}`}>
          Open the form
        </a>
      </main>
    );
  }

  const initialValues = responseParam
    ? (editQuery.data?.answers as Record<string, unknown> | undefined)
    : draftQuery.isSuccess
      ? (draftQuery.data.answers as Record<string, unknown>)
      : undefined;
  const initialStep =
    !responseParam && draftQuery.isSuccess ? draftQuery.data.currentStep : 0;

  return (
    <main className="min-h-screen">
      <PublicFormShell
        key={`${draftParam ?? "live"}-${responseParam ?? ""}`}
        form={form}
        slug={slug}
        password={password}
        initialValues={initialValues}
        initialStep={initialStep}
        draftToken={activeDraft}
        onDraftToken={updateDraftParam}
        onDraftDeleted={clearDraft}
        showSaveDraft={!isEmbed && !responseParam}
        editToken={responseParam}
      />
    </main>
  );
}