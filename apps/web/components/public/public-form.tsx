import React, { useMemo, useRef, useState } from "react";
import { buildResponseSchema, type Field } from "@repo/validators";
import {
  CheckCircle2Icon,
  CreditCardIcon,
  StarIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { getApiOrigin } from "~/lib/api-origin";
import { backgroundStyle, fontFamilyFor } from "~/lib/theme-utils";
import { trpc } from "~/trpc/client";
import { TurnstileWidget } from "./turnstile-widget";
import type {
  FileAnswer,
  PaymentAnswer,
  PublicField,
  PublicFormData,
} from "./types";

export interface PaidPayment {
  fieldId: string;
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface SubmissionMeta {
  honeypot?: string;
  turnstileToken?: string;
  payments?: PaidPayment[];
}

interface PublicFormProps {
  form: PublicFormData;
  onSubmit: (values: Record<string, unknown>, meta?: SubmissionMeta) => Promise<void>;
  onReset?: () => void;
  /** Shared link slug + password so payments can create an order server-side. */
  slug?: string;
  password?: string;
  /** When true (builder preview) payments are simulated and never charged. */
  previewMode?: boolean;
  /** Reports payment answers as they complete so a parent can collect them. */
  onPaymentsChange?: (payments: PaidPayment[]) => void;
}

const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";

interface RazorpayCheckoutHandlerResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  handler: (response: RazorpayCheckoutHandlerResponse) => void;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  modal?: { onDismiss?: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open(): void };
  }
}

let checkoutScriptPromise: Promise<void> | null = null;

function loadCheckoutScript(): Promise<void> {
  if (checkoutScriptPromise) return checkoutScriptPromise;
  checkoutScriptPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Payment is unavailable"));
      return;
    }
    if (window.Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      checkoutScriptPromise = null;
      reject(new Error("Could not load the payment gateway"));
    };
    document.body.appendChild(script);
  });
  return checkoutScriptPromise;
}

type ConditionalRule = NonNullable<PublicField["conditionalLogic"]>["showIf"] & {
  operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than";
};

function evalRule(rule: ConditionalRule, values: Record<string, unknown>): boolean {
  const sourceValue = values[rule.fieldId];
  switch (rule.operator) {
    case "equals":
      return sourceValue === rule.value;
    case "not_equals":
      return sourceValue !== rule.value;
    case "contains":
      return Array.isArray(sourceValue)
        ? sourceValue.includes(rule.value as string)
        : String(sourceValue ?? "").includes(String(rule.value));
    case "greater_than":
      return Number(sourceValue) > Number(rule.value);
    case "less_than":
      return Number(sourceValue) < Number(rule.value);
    default:
      return true;
  }
}

function evalRuleRef(rule: ConditionalRule, values: Record<string, unknown>): boolean {
  return evalRule(rule, values);
}

function fieldIsVisible(field: PublicField, values: Record<string, unknown>): boolean {
  const logic = field.conditionalLogic;
  if (!logic) return true;

  if (logic.showIf && !evalRuleRef(logic.showIf, values)) return false;

  const groups = logic.groups ?? [];
  if (groups.length === 0) return true;

  return groups.some((group) => {
    if (group.conditions.length === 0) return false;
    const results = group.conditions.map((c) => evalRuleRef(c, values));
    return group.all ? results.every(Boolean) : results.some(Boolean);
  });
}

function FieldInput({
  field,
  value,
  onChange,
  autoFocus,
  formId,
  payment,
}: {
  field: PublicField;
  value: unknown;
  onChange: (value: unknown) => void;
  autoFocus?: boolean;
  formId: string;
  payment?: {
    formTitle: string;
    slug?: string;
    password?: string;
    previewMode?: boolean;
    onPaid: (p: PaidPayment) => void;
  };
}) {
  switch (field.type) {
    case "short_text":
    case "email":
    case "number":
    case "url":
    case "time":
    case "date":
    case "phone":
      return (
        <Input
          name={field.id}
          autoFocus={autoFocus}
          type={
            field.type === "email"
              ? "email"
              : field.type === "number"
                ? "number"
                : field.type === "date"
                  ? "date"
                  : field.type === "time"
                    ? "time"
                    : field.type === "url"
                      ? "url"
                      : field.type === "phone"
                        ? "tel"
                        : "text"
          }
          placeholder={field.placeholder ?? undefined}
          value={typeof value === "string" ? value : ""}
          onChange={(e) =>
            onChange(
              field.type === "number"
                ? e.target.value === ""
                  ? undefined
                  : Number(e.target.value)
                : e.target.value,
            )
          }
        />
      );
    case "long_text":
      return (
        <Textarea
          name={field.id}
          autoFocus={autoFocus}
          placeholder={field.placeholder ?? undefined}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "single_select": {
      const options = field.options ?? [];
      if (options.length === 0) {
        return (
          <Input
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      }
      return (
        <Select
          value={typeof value === "string" ? value : undefined}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={field.placeholder ?? "Select an option"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case "multi_select": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const options = field.options ?? [];
      return (
        <div className="flex flex-col gap-2">
          {options.length === 0 ? (
            <Input
              value={selected.join(", ")}
              onChange={() => undefined}
              placeholder="Options not configured"
              disabled
            />
          ) : (
            options.map((opt) => (
              <Label
                key={opt.value}
                className="flex items-center gap-2 font-normal"
              >
                <Checkbox
                  checked={selected.includes(opt.value)}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...selected, opt.value]
                      : selected.filter((v) => v !== opt.value);
                    onChange(next);
                  }}
                />
                {opt.label}
              </Label>
            ))
          )}
        </div>
      );
    }
    case "checkbox":
      return (
        <Checkbox
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(Boolean(checked))}
        />
      );
    case "radio": {
      const options = field.options ?? [];
      return (
        <RadioGroup
          value={
            typeof value === "string" ? (value as string) : undefined
          }
          onValueChange={(v) => onChange(v)}
          className="gap-2"
        >
          {options.length === 0 ? (
            <Input
              value={typeof value === "string" ? value : ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Options not configured"
            />
          ) : (
            options.map((opt) => (
              <Label
                key={opt.value}
                className="flex items-center gap-2 font-normal"
              >
                <RadioGroupItem value={opt.value} />
                {opt.label}
              </Label>
            ))
          )}
        </RadioGroup>
      );
    }
    case "rating":
      return (
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <StarIcon
                className={cn(
                  "size-6",
                  (typeof value === "number" ? n <= value : false) &&
                    "fill-primary text-primary",
                )}
              />
            </button>
          ))}
          <span className="ml-2 text-sm text-muted-foreground">
            {typeof value === "number" ? `${value}/5` : ""}
          </span>
        </div>
      );
    case "scale": {
      const min = Number(field.validationRules?.min ?? 1);
      const max = Number(field.validationRules?.max ?? 10);
      const maxLabel = field.validationRules?.maxLabel;
      const minLabel = field.validationRules?.minLabel;
      const count = Math.max(max - min + 1, 1);
      return (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {Array.from({ length: count }, (_, i) => {
              const n = min + i;
              const selected = value === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange(n)}
                  aria-label={`${n} of ${max}`}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full border text-sm font-medium transition-colors",
                    selected
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "opacity-70 hover:opacity-100",
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>
          {(minLabel || maxLabel) && (
            <div className="flex items-center justify-between text-xs opacity-70">
              <span>{minLabel ?? `${min}`}</span>
              <span>{maxLabel ?? `${max}`}</span>
            </div>
          )}
        </div>
      );
    }
    case "file_upload":
      return (
        <FileUploadInput
          field={field}
          value={value}
          onChange={onChange}
          formId={formId}
          autoFocus={autoFocus}
        />
      );
    case "payment":
      return (
        <PaymentInput
          field={field}
          value={value}
          onChange={onChange}
          formTitle={payment?.formTitle ?? ""}
          slug={payment?.slug}
          password={payment?.password}
          previewMode={payment?.previewMode ?? false}
          onPaid={payment?.onPaid ?? (() => undefined)}
        />
      );
    default:
      return null;
  }
}

function FileUploadInput({
  field,
  value,
  onChange,
  formId,
  autoFocus,
}: {
  field: PublicField;
  value: unknown;
  onChange: (value: unknown) => void;
  formId: string;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const file: FileAnswer | null =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as FileAnswer)
      : null;

  const upload = async (f: File) => {
    const maxSize = Number(field.validationRules?.maxSize ?? 25);
    if (f.size > maxSize * 1024 * 1024) {
      setError(`File exceeds the ${maxSize} MB limit`);
      return;
    }
    const allowed = field.validationRules?.allowedTypes ?? [];
    if (allowed.length > 0 && !allowed.includes(f.type)) {
      setError(`File type "${f.type || "unknown"}" is not allowed`);
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("formId", formId);
      const res = await fetch(`${getApiOrigin()}/upload`, {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as {
        fileId?: string;
        name?: string;
        url?: string;
        size?: number;
        mimeType?: string;
        error?: string;
      };
      if (!res.ok || !json.fileId || !json.name || !json.url) {
        setError(json.error ?? "Upload failed");
        return;
      }
      onChange({
        fileId: json.fileId,
        name: json.name,
        url: `${getApiOrigin()}${json.url}`,
        size: json.size ?? f.size,
        mimeType: json.mimeType ?? f.type,
      } satisfies FileAnswer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {file ? (
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <UploadIcon className="size-4 opacity-70" />
          <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
          <button
            type="button"
            onClick={() => {
              onChange(undefined);
              if (inputRef.current) inputRef.current.value = "";
            }}
            aria-label="Remove file"
            className="opacity-70 transition-opacity hover:opacity-100"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      ) : (
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center opacity-80 transition-opacity hover:opacity-100",
            autoFocus && "ring-2 ring-primary",
          )}
        >
          <UploadIcon className="size-5" />
          <span className="text-sm">
            {uploading ? "Uploading…" : "Click to upload a file"}
          </span>
          <span className="text-xs opacity-70">
            Max {Number(field.validationRules?.maxSize ?? 25)} MB
          </span>
          <input
            ref={inputRef}
            type="file"
            name={field.id}
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </label>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function PaymentInput({
  field,
  value,
  onChange,
  formTitle,
  slug,
  password,
  previewMode,
  onPaid,
}: {
  field: PublicField;
  value: unknown;
  onChange: (value: unknown) => void;
  formTitle: string;
  slug?: string;
  password?: string;
  previewMode?: boolean;
  onPaid: (p: PaidPayment) => void;
}) {
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createOrder = trpc.payment.createOrder.useMutation();

  const amount = Number(field.validationRules?.amount ?? 0);
  const currency = (field.validationRules?.currency ?? "INR").toUpperCase();

  const paid = value && typeof value === "object" && "orderId" in value
      ? (value as PaymentAnswer)
      : null;

  const pay = async () => {
    setError(null);

    if (previewMode) {
      onChange({
        paymentId: "preview",
        orderId: `preview-${field.id}`,
        amount: Math.max(amount, 1),
        currency,
        status: "paid",
      } satisfies PaymentAnswer);
      return;
    }

    if (!amount || amount <= 0) {
      setError("This payment field has no amount configured yet.");
      return;
    }
    if (!slug) {
      setError("Payments are not available in the preview.");
      return;
    }

    setPaying(true);
    try {
      const order = await createOrder.mutateAsync({
        slug,
        password,
        fieldId: field.id,
      });

      await loadCheckoutScript();
      if (!window.Razorpay) {
        throw new Error("Payment gateway is unavailable");
      }

      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount * 100,
        currency: order.currency,
        name: formTitle || "Payment",
        description: field.label,
        order_id: order.orderId,
        theme: { color: "#6d28d9" },
        modal: {
          onDismiss: () => setPaying(false),
        },
        handler: (response) => {
          onPaid({
            fieldId: field.id,
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
          onChange({
            paymentId: response.razorpay_payment_id,
            orderId: response.razorpay_order_id,
            amount: order.amount,
            currency: order.currency,
            status: "paid",
          } satisfies PaymentAnswer);
          setPaying(false);
        },
      });
      checkout.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
      setPaying(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {paid ? (
        <div className="flex items-center gap-2 rounded-md px-1 py-1">
          <CheckCircle2Icon className="size-4 text-emerald-500" />
          <span className="text-sm">
            Paid {currency} {paid.amount}
            {paid.status === "refunded" ? " (refunded)" : ""}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={paying || !amount}
            onClick={() => void pay()}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: "#6d28d9" }}
          >
            <CreditCardIcon className="size-4" />
            {paying
              ? "Opening payment…"
              : amount
                ? `Pay ${currency} ${amount}`
                : "Set an amount in settings"}
          </button>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      )}
    </div>
  );
}

function toValidatorFields(fields: PublicField[]): Field[] {
  return fields.map((f, index) => ({
    id: f.id,
    formId: "preview",
    type: f.type,
    label: f.label,
    required: f.required,
    order: index,
    validationRules: f.validationRules,
    conditionalLogic: f.conditionalLogic,
    options: f.options?.map((o, oi) => ({
      id: `${f.id}-${oi}`,
      label: o.label,
      value: o.value,
      order: oi,
    })),
  }));
}

export function PublicForm({
  form,
  onSubmit,
  onReset,
  slug,
  password,
  previewMode = false,
  onPaymentsChange,
}: PublicFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [started, setStarted] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const paymentsRef = useRef<PaidPayment[]>([]);

  const stepMode = form.settings?.stepMode ?? "all";
  const startScreen = form.settings?.startScreen;
  const endScreen = form.settings?.endScreen;
  const showStartScreen = Boolean(
    startScreen?.enabled && !started && !submitted,
  );

  const visibleFields = useMemo(
    () =>
      form.fields.filter(
        (f) => f.type !== "page_break" && fieldIsVisible(f, values),
      ),
    [form.fields, values],
  );

  const schema = useMemo(
    () => buildResponseSchema(toValidatorFields(visibleFields)),
    [visibleFields],
  );

  const flatIndex = useMemo(
    () => new Map(form.fields.map((f, i) => [f.id, i])),
    [form.fields],
  );

  // Steps: everything on one page (all), one field per screen (question), or
  // one page per screen using page breaks (page).
  const steps = useMemo<PublicField[][]>(() => {
    if (stepMode === "question") {
      return visibleFields.map((f) => [f]);
    }
    if (stepMode === "all") {
      return visibleFields.length > 0 ? [visibleFields] : [];
    }
    const pages: PublicField[][] = [[]];
    for (const f of form.fields) {
      if (f.type === "page_break") {
        pages.push([]);
        continue;
      }
      if (fieldIsVisible(f, values)) {
        pages[pages.length - 1]!.push(f);
      }
    }
    return pages.filter((page) => page.length > 0);
  }, [stepMode, form.fields, values, visibleFields]);

  const isSinglePage = stepMode === "all";

  const totalSteps = steps.length;
  const safeStep = Math.min(currentStep, Math.max(totalSteps - 1, 0));
  const currentFields = totalSteps > 0 ? steps[safeStep]! : [];
  const isLastStep = totalSteps === 0 || safeStep >= totalSteps - 1;

  const buildStepSchema = (fields: PublicField[]) =>
    buildResponseSchema(toValidatorFields(fields));

  // Jump targets: a field may send people to a section (page break) or straight
  // to submission once they reach it.
  type Jump =
    | { kind: "next" }
    | { kind: "submit" }
    | { kind: "step"; target: number };

  const nextJump = (fields: PublicField[]): Jump => {
    for (const f of fields) {
      const logic = f.conditionalLogic;
      if (!logic) continue;
      if (logic.gotoSubmit === true) return { kind: "submit" };
      if (logic.gotoPageId) {
        const breakIdx = flatIndex.get(logic.gotoPageId);
        if (breakIdx !== undefined) {
          const firstAfter = visibleFields.find(
            (vf) => flatIndex.get(vf.id)! > breakIdx,
          );
          if (firstAfter) {
            const target = steps.findIndex((step) =>
              step.some((s) => s.id === firstAfter.id),
            );
            if (target >= 0) return { kind: "step", target: Math.min(target, totalSteps - 1) };
          }
          return { kind: "step", target: Math.max(totalSteps - 1, 0) };
        }
      }
    }
    return { kind: "next" };
  };

  if (submitted) {
    const endTitle = endScreen?.title?.trim() || "Response submitted";
    const endMessage =
      endScreen?.message?.trim() ||
      form.settings?.thankYouMessage?.trim() ||
      "Thank you! Your response has been recorded.";
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <CheckCircle2Icon
          className="size-12"
          style={{ color: form.theme?.colors.primary }}
        />
        <h2 className="text-2xl font-semibold">{endTitle}</h2>
        <p className="text-muted-foreground">{endMessage}</p>
        <Button
          variant="outline"
          onClick={() => {
            setSubmitted(false);
            setValues({});
            setErrors({});
            paymentsRef.current = [];
            setStarted(true);
            setCurrentStep(0);
            onReset?.();
          }}
        >
          {endScreen?.buttonLabel?.trim() || "Submit another response"}
        </Button>
      </div>
    );
  }

  if (showStartScreen) {
    const startTitle = startScreen?.title?.trim() || form.title;
    return (
      <div
        style={{
          ...backgroundStyle(form.theme),
          color: form.theme?.colors.text ?? "#fafafa",
          fontFamily: fontFamilyFor(form.theme?.font),
          minHeight: "100%",
        }}
      >
        <div className="mx-auto w-full max-w-xl px-4 py-12">
          <div
            className="flex flex-col items-center gap-4 rounded-2xl border p-6 text-center sm:p-8"
            style={{
              backgroundColor: form.theme?.colors.surface ?? "#18181b",
              borderColor: `${form.theme?.colors.text ?? "#fafafa"}1f`,
            }}
          >
            <h1 className="text-2xl font-bold">{startTitle}</h1>
            {startScreen?.description?.trim() ? (
              <p className="max-w-md text-sm opacity-80">
                {startScreen.description.trim()}
              </p>
            ) : null}
            <Button
              onClick={() => setStarted(true)}
              className="mt-2"
              style={{
                backgroundColor: form.theme?.colors.primary ?? "#6d28d9",
              }}
            >
              {startScreen?.buttonLabel?.trim() || "Start"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const goToStep = (step: number) => {
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const validateStep = (fields: PublicField[]): boolean => {
    const result = buildStepSchema(fields).safeParse(values);
    if (!result.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = String(issue.path[0] ?? "");
        if (path && !nextErrors[path]) nextErrors[path] = issue.message;
      }
      setErrors(nextErrors);
      return false;
    }
    setErrors({});
    return true;
  };

  const handleNext = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    if (!validateStep(currentFields)) return;
    const jump = nextJump(currentFields);
    if (jump.kind === "submit") {
      void handleSubmit(e);
      return;
    }
    if (jump.kind === "step") {
      goToStep(jump.target);
      return;
    }
    goToStep(safeStep + 1);
  };

  const handleBack = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    goToStep(safeStep - 1);
  };

  const handleSubmit = async (e?: React.MouseEvent | React.KeyboardEvent | React.FormEvent) => {
    e?.preventDefault();
    if (!validateStep(currentFields)) return;
    if (TURNSTILE_SITE_KEY && isLastStep && !turnstileToken) {
      setErrors((prev) => ({ ...prev, _turnstile: "Please complete the verification" }));
      return;
    }
    const result = schema.safeParse(values);
    if (!result.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = String(issue.path[0] ?? "");
        if (path && !nextErrors[path]) nextErrors[path] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await onSubmit(result.data, {
        honeypot: honeypot || "",
        turnstileToken: turnstileToken || undefined,
        payments: paymentsRef.current.length > 0 ? paymentsRef.current : undefined,
      });
      paymentsRef.current = [];
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  // Enter advances to the next question without submitting the whole form.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter") return;
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA") return;
    if (target.tagName === "BUTTON") return;
    if (isLastStep) {
      handleSubmit(e);
    } else {
      handleNext(e);
    }
  };

  const updateValue = (fieldId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    setErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

  const primary = form.theme?.colors.primary ?? "#6d28d9";
  const surface = form.theme?.colors.surface ?? "#18181b";
  const text = form.theme?.colors.text ?? "#fafafa";

  const progress =
    totalSteps === 0 ? 100 : ((safeStep + 1) / totalSteps) * 100;

  return (
    <div
      style={{
        ...backgroundStyle(form.theme),
        color: text,
        fontFamily: fontFamilyFor(form.theme?.font),
        minHeight: "100%",
      }}
    >
      <div className="mx-auto w-full max-w-xl px-4 py-12">
        <div
          className="rounded-2xl border p-6 sm:p-8"
          style={{ backgroundColor: surface, borderColor: `${text}1f` }}
        >
          <h1 className="text-2xl font-bold">{form.title}</h1>
          {form.description ? (
            <p className="mt-2 text-sm opacity-80">{form.description}</p>
          ) : null}
          {form.requiresPassword ? (
            <p className="mt-2 text-xs opacity-60">Password protected form</p>
          ) : null}

          {!isSinglePage && totalSteps > 0 && (
            <div className="mt-6">
              <div className="mb-1.5 flex items-center justify-between text-xs opacity-70">
                <span>
                  Step {safeStep + 1} of {totalSteps}
                </span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: `${primary}2a` }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: primary,
                    width: `${progress}%`,
                  }}
                />
              </div>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(e);
            }}
            onKeyDown={handleKeyDown}
            className="mt-8 flex flex-col gap-6"
          >
            {/* Honeypot: hidden from humans, filled by bots. */}
            <div
              aria-hidden="true"
              className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden"
            >
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            {totalSteps === 0 ? (
              <div className="flex flex-col gap-2">
                {errors._form ? (
                  <p className="text-xs text-destructive">{errors._form}</p>
                ) : null}
                <Button type="submit" disabled={submitting} style={{ backgroundColor: primary }}>
                  {submitting ? "Submitting..." : "Submit"}
                </Button>
              </div>
            ) : (
              <>
                {currentFields.map((field) => (
                  <div key={field.id} className="flex flex-col gap-2">
                    <div className="flex items-center gap-1">
                      <Label htmlFor={field.id}>
                        {field.label}
                        {field.required && <span style={{ color: primary }}> *</span>}
                      </Label>
                    </div>
                    <FieldInput
                      field={field}
                      value={values[field.id]}
                      onChange={(v) => updateValue(field.id, v)}
                      autoFocus={currentFields.length === 1}
                      formId={form.id}
                      payment={{
                        formTitle: form.title,
                        slug,
                        password,
                        previewMode,
                        onPaid: (p) => {
                          paymentsRef.current = paymentsRef.current.filter(
                            (existing) => existing.fieldId !== p.fieldId,
                          );
                          paymentsRef.current.push(p);
                          onPaymentsChange?.(paymentsRef.current);
                        },
                      }}
                    />
                    {field.helpText ? (
                      <p className="text-xs opacity-60">{field.helpText}</p>
                    ) : null}
                    {errors[field.id] ? (
                      <p className="text-xs text-destructive">{errors[field.id]}</p>
                    ) : null}
                  </div>
                ))}

                {isLastStep && TURNSTILE_SITE_KEY ? (
                  <div className={cn("flex flex-col gap-1", errors._turnstile && "opacity-90")}>
                    <TurnstileWidget
                      siteKey={TURNSTILE_SITE_KEY}
                      onToken={setTurnstileToken}
                      onExpire={() => setTurnstileToken("")}
                    />
                    {errors._turnstile ? (
                      <p className="text-xs text-destructive">{errors._turnstile}</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex items-center gap-3">
                  {safeStep > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleBack}
                      disabled={submitting}
                    >
                      Back
                    </Button>
                  ) : null}
                  {isLastStep ? (
                    <Button
                      type="submit"
                      disabled={submitting}
                      className="flex-1"
                      style={{ backgroundColor: primary }}
                    >
                      {submitting ? "Submitting..." : "Submit"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={handleNext}
                      className="flex-1"
                      style={{ backgroundColor: primary }}
                    >
                      Next
                    </Button>
                  )}
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}