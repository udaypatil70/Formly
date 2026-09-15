import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import type { FieldType } from "@repo/validators";

import { trpc } from "~/trpc/client";
import type { BuilderField, BuilderFormSettings, BuilderTheme } from "~/lib/builder-types";
import type { FormBuilderMeta } from "./form-builder";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "~/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { mapTheme, ThemeSection } from "./theme-editor";

interface FieldInspectorProps {
  field: BuilderField | null;
  fields: { id: string; label: string; type: FieldType }[];
  theme: BuilderTheme | null;
  meta: FormBuilderMeta;
  onUpdateMeta: (patch: Partial<FormBuilderMeta>) => void;
  onSettingsChange: (patch: Partial<BuilderFormSettings>) => void;
  onThemeChange: (t: BuilderTheme | null) => void;
  onUpdate: (id: string, patch: Partial<BuilderField>) => void;
  onDelete: (id: string) => void;
}

const FIELD_TYPES: FieldType[] = [
  "short_text",
  "long_text",
  "email",
  "number",
  "single_select",
  "multi_select",
  "checkbox",
  "radio",
  "rating",
  "date",
];

export function FieldInspector({
  field,
  fields,
  theme,
  meta,
  onUpdateMeta,
  onSettingsChange,
  onThemeChange,
  onUpdate,
  onDelete,
}: FieldInspectorProps) {
  const themes = trpc.theme.getAll.useQuery();
  const themeList: BuilderTheme[] = themes.data ? themes.data.map(mapTheme) : [];

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l lg:flex">
      <div className="flex h-12 shrink-0 items-center border-b px-4 text-sm font-medium">
        {field ? "Field settings" : "Form settings"}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-5 p-4">
          {field ? (
            <FieldSettings
              field={field}
              fields={fields}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ) : (
            <FormSettings
              meta={meta}
              theme={theme}
              themes={themeList}
              onUpdateMeta={onUpdateMeta}
              onSettingsChange={onSettingsChange}
              onThemeChange={onThemeChange}
            />
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function FieldSettings({
  field,
  fields,
  onUpdate,
  onDelete,
}: {
  field: BuilderField;
  fields: { id: string; label: string; type: FieldType }[];
  onUpdate: (id: string, patch: Partial<BuilderField>) => void;
  onDelete: (id: string) => void;
}) {
  const otherFields = fields.filter((f) => f.id !== field.id);
  const acceptsText = field.type === "short_text" || field.type === "long_text";
  const acceptsNumber = field.type === "number";
  const hasOptions =
    field.type === "single_select" ||
    field.type === "multi_select" ||
    field.type === "radio";

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="field-label">Label</Label>
        <Input
          id="field-label"
          value={field.label}
          onChange={(e) => onUpdate(field.id, { label: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Type</Label>
        <Select
          value={field.type}
          onValueChange={(v) => onUpdate(field.id, { type: v as FieldType })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                <span className="capitalize">{t.replace("_", " ")}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {field.type !== "checkbox" &&
        field.type !== "rating" &&
        field.type !== "single_select" &&
        field.type !== "multi_select" &&
        field.type !== "radio" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="field-placeholder">Placeholder</Label>
            <Input
              id="field-placeholder"
              value={field.placeholder ?? ""}
              onChange={(e) => onUpdate(field.id, { placeholder: e.target.value })}
            />
          </div>
        )}

      {field.type !== "rating" &&
        field.type !== "checkbox" &&
        field.type !== "single_select" &&
        field.type !== "multi_select" &&
        field.type !== "radio" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="field-help">Help text</Label>
            <Textarea
              id="field-help"
              value={field.helpText ?? ""}
              onChange={(e) => onUpdate(field.id, { helpText: e.target.value })}
            />
          </div>
        )}

      <div className="flex items-center justify-between">
        <Label htmlFor="field-required">Required</Label>
        <Switch
          id="field-required"
          checked={field.required}
          onCheckedChange={(checked) =>
            onUpdate(field.id, { required: Boolean(checked) })
          }
        />
      </div>

      {hasOptions && (
        <OptionsEditor
          field={field}
          onUpdate={onUpdate}
        />
      )}

      {(acceptsText || acceptsNumber) && (
        <ValidationEditor
          field={field}
          onUpdate={onUpdate}
        />
      )}

      <ConditionalEditor
        field={field}
        otherFields={otherFields}
        onUpdate={onUpdate}
      />

      <Separator />

      <Button
        variant="destructive"
        size="sm"
        onClick={() => onDelete(field.id)}
      >
        <Trash2Icon /> Delete field
      </Button>
    </>
  );
}

function OptionsEditor({
  field,
  onUpdate,
}: {
  field: BuilderField;
  onUpdate: (id: string, patch: Partial<BuilderField>) => void;
}) {
  const options = field.options ?? [];

  const commit = (next: NonNullable<BuilderField["options"]>) => {
    onUpdate(field.id, { options: next });
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>Options</Label>
      <div className="flex flex-col gap-2">
        {options.map((opt, index) => (
          <div key={opt.value} className="flex items-center gap-2">
            <Input
              value={opt.label}
              placeholder="Label"
              onChange={(e) => {
                const next = options.map((o, i) =>
                  i === index ? { ...o, label: e.target.value } : o,
                );
                commit(next);
              }}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => commit(options.filter((_, i) => i !== index))}
              aria-label="Remove option"
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          commit([
            ...options,
            {
              label: `Option ${options.length + 1}`,
              value: `option-${options.length + 1}`,
              order: options.length,
            },
          ])
        }
      >
        <PlusIcon /> Add option
      </Button>
    </div>
  );
}

function ValidationEditor({
  field,
  onUpdate,
}: {
  field: BuilderField;
  onUpdate: (id: string, patch: Partial<BuilderField>) => void;
}) {
  const rules = field.validationRules ?? {};
  const text = field.type === "short_text" || field.type === "long_text";
  const number = field.type === "number";

  return (
    <div className="flex flex-col gap-3">
      <Label>Validation</Label>
      {text && (
        <>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              placeholder="Min length"
              value={rules.minLength ?? ""}
              onChange={(e) =>
                onUpdate(field.id, {
                  validationRules: {
                    ...rules,
                    minLength: e.target.value === "" ? undefined : Number(e.target.value),
                  },
                })
              }
            />
            <Input
              type="number"
              min={1}
              placeholder="Max length"
              value={rules.maxLength ?? ""}
              onChange={(e) =>
                onUpdate(field.id, {
                  validationRules: {
                    ...rules,
                    maxLength: e.target.value === "" ? undefined : Number(e.target.value),
                  },
                })
              }
            />
          </div>
          <Input
            placeholder="Regex pattern"
            value={rules.pattern ?? ""}
            onChange={(e) =>
              onUpdate(field.id, {
                validationRules: { ...rules, pattern: e.target.value },
              })
            }
          />
        </>
      )}
      {number && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={rules.min ?? ""}
            onChange={(e) =>
              onUpdate(field.id, {
                validationRules: {
                  ...rules,
                  min: e.target.value === "" ? undefined : Number(e.target.value),
                },
              })
            }
          />
          <Input
            type="number"
            placeholder="Max"
            value={rules.max ?? ""}
            onChange={(e) =>
              onUpdate(field.id, {
                validationRules: {
                  ...rules,
                  max: e.target.value === "" ? undefined : Number(e.target.value),
                },
              })
            }
          />
        </div>
      )}
    </div>
  );
}

function ConditionalEditor({
  field,
  otherFields,
  onUpdate,
}: {
  field: BuilderField;
  otherFields: { id: string; label: string; type: FieldType }[];
  onUpdate: (id: string, patch: Partial<BuilderField>) => void;
}) {
  const [enabled, setEnabled] = useState(
    Boolean(field.conditionalLogic?.showIf),
  );
  const rule = field.conditionalLogic?.showIf;

  const toggle = (checked: boolean) => {
    setEnabled(checked);
    if (checked) {
      const source = otherFields[0];
      onUpdate(field.id, {
        conditionalLogic: {
          showIf: {
            fieldId: source?.id ?? "",
            operator: "equals",
            value: "",
          },
        },
      });
    } else {
      onUpdate(field.id, { conditionalLogic: {} });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="field-cond">Conditional logic</Label>
        <Switch id="field-cond" checked={enabled} onCheckedChange={toggle} />
      </div>

      {enabled && rule && otherFields.length > 0 && (
        <div className="flex flex-col gap-2">
          <Select
            value={rule.fieldId}
            onValueChange={(v) =>
              onUpdate(field.id, {
                conditionalLogic: { showIf: { ...rule, fieldId: v } },
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Source field" />
            </SelectTrigger>
            <SelectContent>
              {otherFields.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.label || "Untitled field"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={rule.operator}
            onValueChange={(v) =>
              onUpdate(field.id, {
                conditionalLogic: {
                  showIf: { ...rule, operator: v as (typeof rule)["operator"] },
                },
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["equals", "not_equals", "contains", "greater_than", "less_than"].map(
                (op) => (
                  <SelectItem key={op} value={op}>
                    <span className="capitalize">{op.replace("_", " ")}</span>
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>

          <Input
            value={String(rule.value ?? "")}
            placeholder="Value"
            onChange={(e) => {
              const raw = e.target.value;
              const num = Number(raw);
              onUpdate(field.id, {
                conditionalLogic: {
                  showIf: {
                    ...rule,
                    value: raw === "" ? "" : Number.isFinite(num) && raw.trim() !== "" && (rule.operator === "greater_than" || rule.operator === "less_than") ? num : raw,
                  },
                },
              });
            }}
          />
        </div>
      )}

      {enabled && otherFields.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Add another field first to set conditional logic.
        </p>
      )}
    </div>
  );
}

function FormSettings({
  meta,
  theme,
  themes,
  onUpdateMeta,
  onSettingsChange,
  onThemeChange,
}: {
  meta: FormBuilderMeta;
  theme: BuilderTheme | null;
  themes: BuilderTheme[];
  onUpdateMeta: (patch: Partial<FormBuilderMeta>) => void;
  onSettingsChange: (patch: Partial<BuilderFormSettings>) => void;
  onThemeChange: (t: BuilderTheme | null) => void;
}) {
  const settings = meta.settings ?? {};

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="form-title">Title</Label>
        <Input
          id="form-title"
          value={meta.title}
          onChange={(e) => onUpdateMeta({ title: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="form-description">Description</Label>
        <Textarea
          id="form-description"
          rows={3}
          value={meta.description ?? ""}
          placeholder="Short description shown on the form"
          onChange={(e) => onUpdateMeta({ description: e.target.value })}
        />
      </div>

      <Separator />

      <ThemeSection themes={themes} selected={theme} meta={meta} onSelect={onThemeChange} />

      <Separator />

      <div className="flex flex-col gap-2">
        <Label htmlFor="form-thank-you">Thank-you message</Label>
        <Textarea
          id="form-thank-you"
          rows={2}
          value={settings.thankYouMessage ?? ""}
          placeholder="Shown after someone submits this form"
          onChange={(e) =>
            onSettingsChange({ thankYouMessage: e.target.value })
          }
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="form-response-limit">Response limit</Label>
        <Input
          id="form-response-limit"
          type="number"
          min={1}
          placeholder="No limit"
          value={settings.responseLimit ?? ""}
          onChange={(e) =>
            onSettingsChange({
              responseLimit:
                e.target.value === "" ? null : Number(e.target.value),
            })
          }
        />
        <p className="text-xs text-muted-foreground">
          Stop accepting responses after this many submissions.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="form-expiry">Expiry date</Label>
        <Input
          id="form-expiry"
          type="date"
          value={
            settings.expiry ? settings.expiry.slice(0, 10) : ""
          }
          min={new Date().toISOString().slice(0, 10)}
          onChange={(e) =>
            onSettingsChange({
              expiry: e.target.value
                ? new Date(`${e.target.value}T00:00:00`).toISOString()
                : null,
            })
          }
        />
        <p className="text-xs text-muted-foreground">
          The form stops accepting responses after this date.
        </p>
      </div>
    </div>
  );
}
