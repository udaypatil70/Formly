import React, { useMemo, useState } from "react";
import { buildResponseSchema, type Field } from "@repo/validators";
import { CheckCircle2Icon, StarIcon } from "lucide-react";

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
import { backgroundStyle, fontFamilyFor } from "~/lib/theme-utils";
import { TurnstileWidget } from "./turnstile-widget";
import type { PublicField, PublicFormData } from "./types";

export interface SubmissionMeta {
  honeypot?: string;
  turnstileToken?: string;
}

interface PublicFormProps {
  form: PublicFormData;
  onSubmit: (values: Record<string, unknown>, meta?: SubmissionMeta) => Promise<void>;
  onReset?: () => void;
}

const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";

function fieldIsVisible(field: PublicField, values: Record<string, unknown>): boolean {
  const rule = field.conditionalLogic?.showIf;
  if (!rule) return true;

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

function FieldInput({
  field,
  value,
  onChange,
  autoFocus,
}: {
  field: PublicField;
  value: unknown;
  onChange: (value: unknown) => void;
  autoFocus?: boolean;
}) {
  switch (field.type) {
    case "short_text":
    case "email":
    case "number":
    case "date":
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
    default:
      return null;
  }
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
}: PublicFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [honeypot, setHoneypot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  const stepMode = form.settings?.stepMode ?? "question";

  const schema = useMemo(() => buildResponseSchema(toValidatorFields(form.fields)), [form.fields]);

  // Steps: one field per screen (question mode) or one page per screen (page mode).
  const steps = useMemo<PublicField[][]>(() => {
    if (stepMode === "question") {
      return form.fields
        .filter((f) => f.type !== "page_break" && fieldIsVisible(f, values))
        .map((f) => [f]);
    }
    const pages: PublicField[][] = [[]];
    for (const f of form.fields) {
      if (f.type === "page_break") {
        pages.push([]);
        continue;
      }
      pages[pages.length - 1]!.push(f);
    }
    return pages
      .map((page) => page.filter((f) => fieldIsVisible(f, values)))
      .filter((page) => page.length > 0);
  }, [stepMode, form.fields, values]);

  const totalSteps = steps.length;
  const safeStep = Math.min(currentStep, Math.max(totalSteps - 1, 0));
  const currentFields = totalSteps > 0 ? steps[safeStep]! : [];
  const isLastStep = totalSteps === 0 || safeStep >= totalSteps - 1;

  const buildStepSchema = (fields: PublicField[]) =>
    buildResponseSchema(toValidatorFields(fields));

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <CheckCircle2Icon
          className="size-12"
          style={{ color: form.theme?.colors.primary }}
        />
        <h2 className="text-2xl font-semibold">Response submitted</h2>
        <p className="text-muted-foreground">
          {form.settings?.thankYouMessage?.trim() ||
            "Thank you! Your response has been recorded."}
        </p>
        <Button variant="outline" onClick={() => onReset?.() ?? window.location.reload()}>
          Submit another response
        </Button>
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
      });
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

          {totalSteps > 0 && (
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