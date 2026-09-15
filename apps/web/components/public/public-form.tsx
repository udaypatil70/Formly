import React, { useMemo, useState } from "react";
import { buildResponseSchema, type Field } from "@repo/validators";
import { CheckCircle2Icon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import type { PublicField, PublicFormData } from "./types";

interface PublicFormProps {
  form: PublicFormData;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}

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
}: {
  field: PublicField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (field.type) {
    case "short_text":
    case "email":
    case "number":
    case "date":
      return (
        <Input
          name={field.id}
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
    case "rating":
      return (
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={cn(
                "size-9 rounded-md border text-sm font-medium transition-colors",
                value === n
                  ? "border-transparent text-white"
                  : "border-input bg-transparent hover:bg-accent",
              )}
              style={value === n ? { background: "var(--primary)" } : undefined}
              aria-label={`${n} stars`}
            >
              {n}
            </button>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export function PublicForm({ form, onSubmit }: PublicFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const schema = useMemo(() => {
    const fields: Field[] = form.fields.map((f, index) => ({
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
    return buildResponseSchema(fields);
  }, [form.fields]);

  const visibleFields = form.fields.filter((f) =>
    fieldIsVisible(f as PublicField, values),
  );

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <CheckCircle2Icon
          className="size-12"
          style={{ color: form.theme?.colors.primary }}
        />
        <h2 className="text-2xl font-semibold">Response submitted</h2>
        <p className="text-muted-foreground">
          Thank you! Your response has been recorded.
        </p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Submit another response
        </Button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      await onSubmit(result.data);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
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
  const background = form.theme?.colors.background ?? "#0b0b0d";
  const surface = form.theme?.colors.surface ?? "#18181b";
  const text = form.theme?.colors.text ?? "#fafafa";

  return (
    <div style={{ backgroundColor: background, color: text }}>
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

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
            {visibleFields.map((field) => (
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
                />
                {field.helpText ? (
                  <p className="text-xs opacity-60">{field.helpText}</p>
                ) : null}
                {errors[field.id] ? (
                  <p className="text-xs text-destructive">{errors[field.id]}</p>
                ) : null}
              </div>
            ))}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full"
              style={{ backgroundColor: primary }}
            >
              {submitting ? "Submitting..." : "Submit"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
