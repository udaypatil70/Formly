import { useState, useEffect } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import type { ConditionalLogic, FieldType } from "@repo/validators";

import { trpc } from "~/trpc/client";
import type { BuilderField, BuilderFormSettings, BuilderTheme } from "~/lib/builder-types";
import type { FormBuilderMeta } from "./form-builder";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
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
import { cn } from "~/lib/utils";
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

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 255);

const FIELD_TYPES: FieldType[] = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "url",
  "number",
  "single_select",
  "multi_select",
  "checkbox",
  "radio",
  "rating",
  "scale",
  "date",
  "time",
  "file_upload",
  "payment",
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
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l lg:flex">
      <div className="flex h-12 shrink-0 items-center border-b px-4 text-sm font-medium">
        {field ? "Field settings" : "Form settings"}
      </div>
      <FieldInspectorContent
        field={field}
        fields={fields}
        theme={theme}
        meta={meta}
        onUpdateMeta={onUpdateMeta}
        onSettingsChange={onSettingsChange}
        onThemeChange={onThemeChange}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    </aside>
  );
}

export function FieldInspectorContent({
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
            fields={fields}
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
  const otherFields = fields.filter(
    (f) => f.id !== field.id && f.type !== "page_break",
  );

  if (field.type === "page_break") {
    return (
      <>
        <div className="flex flex-col gap-2">
          <Label htmlFor="field-label">Label</Label>
          <Input
            id="field-label"
            value={field.label}
            onChange={(e) => onUpdate(field.id, { label: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Questions after this divider appear on a new page, with a progress
            bar and step navigation in the preview.
          </p>
        </div>
        <Separator />
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onDelete(field.id)}
        >
          <Trash2Icon /> Remove page break
        </Button>
      </>
    );
  }

  const acceptsText =
    field.type === "short_text" ||
    field.type === "long_text" ||
    field.type === "phone" ||
    field.type === "url" ||
    field.type === "time";
  const acceptsNumber = field.type === "number" || field.type === "scale";
  const isFileUpload = field.type === "file_upload";
  const isPayment = field.type === "payment";
  const hasOptions =
    field.type === "single_select" ||
    field.type === "multi_select" ||
    field.type === "radio";

  const noPlaceholder =
    field.type === "checkbox" ||
    field.type === "rating" ||
    field.type === "scale" ||
    field.type === "single_select" ||
    field.type === "multi_select" ||
    field.type === "radio" ||
    field.type === "file_upload" ||
    field.type === "payment";

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

      <AnswerPipeEditor field={field} fields={fields} onUpdate={onUpdate} />

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

      {!noPlaceholder && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="field-placeholder">Placeholder</Label>
          <Input
            id="field-placeholder"
            value={field.placeholder ?? ""}
            onChange={(e) => onUpdate(field.id, { placeholder: e.target.value })}
          />
        </div>
      )}

      {!noPlaceholder && (
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

      {isFileUpload && (
        <FileUploadConfig
          field={field}
          onUpdate={onUpdate}
        />
      )}

      {isPayment && (
        <PaymentConfig
          field={field}
          onUpdate={onUpdate}
        />
      )}

      <ConditionalEditor
        field={field}
        otherFields={otherFields}
        pageBreaks={fields.filter((f) => f.type === "page_break")}
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

function AnswerPipeEditor({
  field,
  fields,
  onUpdate,
}: {
  field: BuilderField;
  fields: { id: string; label: string; type: FieldType }[];
  onUpdate: (id: string, patch: Partial<BuilderField>) => void;
}) {
  const selfIndex = fields.findIndex((f) => f.id === field.id);
  const earlier = fields
    .filter((f) => f.id !== field.id && f.type !== "payment")
    .slice(0, selfIndex < 0 ? undefined : selfIndex);

  const [sourceId, setSourceId] = useState(earlier[0]?.id ?? "");
  const [target, setTarget] = useState<"label" | "placeholder" | "helpText">(
    "label",
  );

  if (earlier.length === 0) return null;

  const insert = () => {
    const source = earlier.find((f) => f.id === sourceId) ?? earlier[earlier.length - 1];
    if (!source) return;
    const token = `{{${source.id}}}`;
    const current =
      target === "label"
        ? field.label
        : target === "placeholder"
          ? field.placeholder ?? ""
          : field.helpText ?? "";
    const next = current.trim() ? `${current.trim()} ${token}` : token;
    onUpdate(field.id, { [target]: next } as Partial<BuilderField>);
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <p className="text-sm font-medium">Insert previous answer</p>
      <div className="flex items-center gap-1.5">
        <Select value={target} onValueChange={(v) => setTarget(v as typeof target)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="label">Label</SelectItem>
            <SelectItem value="placeholder">Placeholder</SelectItem>
            <SelectItem value="helpText">Help text</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceId} onValueChange={setSourceId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Source field" />
          </SelectTrigger>
          <SelectContent>
            {earlier.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.label || "Untitled field"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={insert}>
        <PlusIcon /> Insert answer
      </Button>
      <p className="text-xs text-muted-foreground">
        Fills in the answer from an earlier question when the form is shown.
        Only questions above this one can be referenced.
      </p>
    </div>
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
  const number = field.type === "number" || field.type === "scale";

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

function FileUploadConfig({
  field,
  onUpdate,
}: {
  field: BuilderField;
  onUpdate: (id: string, patch: Partial<BuilderField>) => void;
}) {
  const rules = field.validationRules ?? {};
  const maxSize = rules.maxSize ?? 25;

  const toggleType = (mime: string) => {
    const current = rules.allowedTypes ?? [];
    const next = current.includes(mime)
      ? current.filter((m) => m !== mime)
      : [...current, mime];
    onUpdate(field.id, { validationRules: { ...rules, allowedTypes: next } });
  };

  const isType = (mime: string) => (rules.allowedTypes ?? []).includes(mime);

  const groups = [
    { label: "Images", types: ["image/jpeg", "image/png", "image/webp", "image/gif"] },
    { label: "Documents", types: ["application/pdf", "text/csv", "application/zip"] },
    { label: "Other", types: ["audio/mpeg", "video/mp4"] },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Label>File upload settings</Label>
      <div className="flex flex-col gap-2">
        <Label htmlFor="field-max-size" className="text-xs text-muted-foreground">
          Max file size (MB)
        </Label>
        <Input
          id="field-max-size"
          type="number"
          min={1}
          max={25}
          value={maxSize}
          onChange={(e) =>
            onUpdate(field.id, {
              validationRules: {
                ...rules,
                maxSize:
                  e.target.value === "" ? undefined : Number(e.target.value),
              },
            })
          }
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground">Allowed file types</Label>
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="text-xs font-medium">{group.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {group.types.map((mime) => (
                <button
                  key={mime}
                  type="button"
                  onClick={() => toggleType(mime)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                    isType(mime)
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {mime.replace("image/", "").replace("application/", "").replace("text/", "txt ")}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Leave unselected to allow the default set (images, PDFs, spreadsheets,
          zip).
        </p>
      </div>
    </div>
  );
}

function PaymentConfig({
  field,
  onUpdate,
}: {
  field: BuilderField;
  onUpdate: (id: string, patch: Partial<BuilderField>) => void;
}) {
  const rules = field.validationRules ?? {};
  const amount = rules.amount ?? "";

  return (
    <div className="flex flex-col gap-3">
      <Label>Payment settings</Label>
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="field-payment-amount"
          className="text-xs text-muted-foreground"
        >
          Amount (whole rupees)
        </Label>
        <Input
          id="field-payment-amount"
          type="number"
          min={1}
          step={1}
          placeholder="e.g. 99"
          value={amount}
          onChange={(e) =>
            onUpdate(field.id, {
              validationRules: {
                ...rules,
                amount:
                  e.target.value === "" ? undefined : Math.max(1, Math.round(Number(e.target.value) || 0)),
                currency: rules.currency ?? "INR",
              },
            })
          }
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="field-payment-currency"
          className="text-xs text-muted-foreground"
        >
          Currency
        </Label>
        <Select
          value={(rules.currency ?? "INR").toUpperCase()}
          onValueChange={(v) =>
            onUpdate(field.id, {
              validationRules: { ...rules, currency: v },
            })
          }
        >
          <SelectTrigger id="field-payment-currency" className="w-full">
            <SelectValue placeholder="INR" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="INR">INR — Indian Rupee (₹)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        Collect a payment from every respondent through Razorpay before their
        response is submitted.
      </p>
    </div>
  );
}

function ConditionalEditor({
  field,
  otherFields,
  pageBreaks,
  onUpdate,
}: {
  field: BuilderField;
  otherFields: { id: string; label: string; type: FieldType }[];
  pageBreaks: { id: string; label: string }[];
  onUpdate: (id: string, patch: Partial<BuilderField>) => void;
}) {
  const logic = field.conditionalLogic;
  // Legacy single-rule `showIf` fields render as one AND group.
  const groups: NonNullable<ConditionalLogic>["groups"] =
    logic?.groups && logic.groups.length > 0
      ? logic.groups
      : logic?.showIf
        ? [
            {
              id: "legacy",
              all: true,
              conditions: [logic.showIf],
            },
          ]
        : [];
  const [enabled, setEnabled] = useState(
    Boolean(logic?.showIf) || (logic?.groups?.length ?? 0) > 0,
  );

  const toggle = (checked: boolean) => {
    setEnabled(checked);
    if (checked) {
      onUpdate(field.id, {
        conditionalLogic: {
          groups: [
            {
              id: crypto.randomUUID(),
              all: true,
              conditions: [
                {
                  fieldId: otherFields[0]?.id ?? "",
                  operator: "equals",
                  value: "",
                },
              ],
            },
          ],
        },
      });
    } else {
      onUpdate(field.id, { conditionalLogic: {} });
    }
  };

  const updateGroup = (
    groupId: string,
    patch: Partial<{
      id: string;
      all: boolean;
      conditions: {
        fieldId: string;
        operator:
          | "equals"
          | "not_equals"
          | "contains"
          | "greater_than"
          | "less_than";
        value: string | number | boolean;
      }[];
    }>,
  ) => {
    onUpdate(field.id, {
      conditionalLogic: {
        ...logic,
        groups: groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
      },
    });
  };

  const updateCondition = (
    groupId: string,
    index: number,
    patch: Partial<{
      fieldId: string;
      operator:
        | "equals"
        | "not_equals"
        | "contains"
        | "greater_than"
        | "less_than";
      value: string | number | boolean;
    }>,
  ) => {
    updateGroup(groupId, {
      conditions: groups
        .find((g) => g.id === groupId)!
        .conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    });
  };

  const addCondition = (groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    updateGroup(groupId, {
      conditions: [
        ...group.conditions,
        {
          fieldId: otherFields[otherFields.length - 1]?.id ?? "",
          operator: "equals",
          value: "",
        },
      ],
    });
  };

  const addGroup = () => {
    onUpdate(field.id, {
      conditionalLogic: {
        ...logic,
        groups: [
          ...groups,
          {
            id: crypto.randomUUID(),
            all: true,
            conditions: [
              {
                fieldId: otherFields[0]?.id ?? "",
                operator: "equals",
                value: "",
              },
            ],
          },
        ],
      },
    });
  };

  const removeGroup = (groupId: string) => {
    onUpdate(field.id, {
      conditionalLogic: {
        ...logic,
        groups: groups.filter((g) => g.id !== groupId),
      },
    });
  };

  const setJump = (value: string) => {
    const next = { ...logic };
    if (value === "none") {
      delete next.gotoPageId;
      delete next.gotoSubmit;
    } else if (value === "submit") {
      delete next.gotoPageId;
      next.gotoSubmit = true;
    } else {
      next.gotoPageId = value;
      delete next.gotoSubmit;
    }
    onUpdate(field.id, { conditionalLogic: next });
  };

  const jumpValue =
    logic?.gotoSubmit === true
      ? "submit"
      : logic?.gotoPageId
        ? logic.gotoPageId
        : "none";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="field-cond">Conditional logic</Label>
        <Switch id="field-cond" checked={enabled} onCheckedChange={toggle} />
      </div>

      {enabled && otherFields.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Add another field first to set conditional logic.
        </p>
      )}

      {enabled && otherFields.length > 0 && (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <div
              key={group.id}
              className="flex flex-col gap-2 rounded-md border p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => updateGroup(group.id, { all: true })}
                    className={cn(
                      "rounded-md border px-2 py-0.5 font-medium",
                      group.all
                        ? "border-primary bg-primary/10 text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    AND
                  </button>
                  <span className="text-muted-foreground">or</span>
                  <button
                    type="button"
                    onClick={() => updateGroup(group.id, { all: false })}
                    className={cn(
                      "rounded-md border px-2 py-0.5 font-medium",
                      !group.all
                        ? "border-primary bg-primary/10 text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    OR
                  </button>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeGroup(group.id)}
                  aria-label="Remove condition group"
                >
                  <Trash2Icon />
                </Button>
              </div>

              <div className="flex flex-col gap-2">
                {group.conditions.map((condition, index) => (
                  <div key={index} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={condition.fieldId}
                        onValueChange={(v) =>
                          updateCondition(group.id, index, { fieldId: v })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Field" />
                        </SelectTrigger>
                        <SelectContent>
                          {otherFields.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.label || "Untitled field"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          updateGroup(group.id, {
                            conditions: group.conditions.filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                        aria-label="Remove condition"
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={condition.operator}
                        onValueChange={(v) =>
                          updateCondition(group.id, index, {
                            operator: v as
                              | "equals"
                              | "not_equals"
                              | "contains"
                              | "greater_than"
                              | "less_than",
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
                                <span className="capitalize">
                                  {op.replace("_", " ")}
                                </span>
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                      <Input
                        value={String(condition.value ?? "")}
                        placeholder="Value"
                        onChange={(e) => {
                          const raw = e.target.value;
                          const num = Number(raw);
                          const isCompare =
                            condition.operator === "greater_than" ||
                            condition.operator === "less_than";
                          updateCondition(group.id, index, {
                            value:
                              raw === ""
                                ? ""
                                : Number.isFinite(num) && isCompare
                                  ? num
                                  : raw,
                          });
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => addCondition(group.id)}
              >
                <PlusIcon /> Add condition
              </Button>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addGroup}>
            <PlusIcon /> Add group
          </Button>
          <p className="text-xs text-muted-foreground">
            Show this field when the conditions are met.
          </p>
        </div>
      )}

      {enabled && (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            <Label htmlFor="field-jump">After answering this field</Label>
            <Select value={jumpValue} onValueChange={setJump}>
              <SelectTrigger id="field-jump" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="text-muted-foreground">Continue normally</span>
                </SelectItem>
                {pageBreaks.map((pb) => (
                  <SelectItem key={pb.id} value={pb.id}>
                    Go to section: {pb.label || "Untitled page"}
                  </SelectItem>
                ))}
                <SelectItem value="submit">Submit the form</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Jump straight to a section (page break) or end the form when this
              field gets an answer.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function WebhooksSettings({ formId }: { formId: string }) {
  const utils = trpc.useUtils();
  const hooks = trpc.webhook.list.useQuery({ formId });
  const createHook = trpc.webhook.create.useMutation({
    onSuccess: () => {
      utils.webhook.list.invalidate({ formId });
    },
  });
  const updateHook = trpc.webhook.update.useMutation({
    onSuccess: () => {
      utils.webhook.list.invalidate({ formId });
    },
  });
  const deleteHook = trpc.webhook.delete.useMutation({
    onSuccess: () => {
      utils.webhook.list.invalidate({ formId });
    },
  });
  const testHook = trpc.webhook.test.useMutation({});

  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!url.trim()) {
      setError("Enter a webhook URL.");
      return;
    }
    setError(null);
    createHook.mutate(
      {
        formId,
        url: url.trim(),
        secret: secret.trim() || undefined,
        events: ["response.created"],
      },
      {
        onSuccess: () => {
          setUrl("");
          setSecret("");
        },
        onError: (err) => setError(err.message),
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Webhooks</p>
        <p className="text-xs text-muted-foreground">
          POST a JSON payload to your own endpoint whenever someone submits the
          form.
        </p>
      </div>

      {hooks.data?.length ? (
        <div className="flex flex-col gap-2">
          {hooks.data.map((hook) => (
            <div
              key={hook.id}
              className="flex flex-col gap-2 rounded-md border p-3"
            >
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate text-xs">
                  {hook.url}
                </code>
                <Switch
                  checked={hook.active}
                  onCheckedChange={(checked) =>
                    updateHook.mutate({ id: hook.id, active: checked })
                  }
                  aria-label="Toggle webhook"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => deleteHook.mutate({ id: hook.id })}
                  aria-label="Delete webhook"
                >
                  <Trash2Icon />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={testHook.isPending}
                  onClick={() => testHook.mutate({ id: hook.id })}
                >
                  {testHook.isPending ? "Testing…" : "Test"}
                </Button>
                {testHook.data?.ok === true ? (
                  <span className="text-xs font-medium text-emerald-600">
                    Delivered (HTTP {testHook.data.status})
                  </span>
                ) : testHook.data && testHook.data.ok === false ? (
                  <span
                    className="text-xs font-medium text-destructive"
                    title={testHook.data.error ?? ""}
                  >
                    Failed ({testHook.data.error})
                  </span>
                ) : hook.lastStatus ? (
                  <span className="text-xs text-muted-foreground">
                    Last: HTTP {hook.lastStatus}{" "}
                    {hook.lastTriggeredAt
                      ? new Date(hook.lastTriggeredAt).toLocaleString()
                      : ""}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Awaiting first delivery
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        !hooks.isLoading && (
          <p className="text-xs text-muted-foreground">
            No webhooks yet. Add one below to receive submissions.
          </p>
        )
      )}

      <div className="flex flex-col gap-2 rounded-md border p-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="webhook-url">Endpoint URL</Label>
          <Input
            id="webhook-url"
            type="url"
            placeholder="https://your-app.com/hooks/formly"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="webhook-secret">Secret (optional)</Label>
          <Input
            id="webhook-secret"
            placeholder="Used to sign payloads with HMAC-SHA256"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <Button
          size="sm"
          type="button"
          disabled={createHook.isPending}
          onClick={submit}
        >
          <PlusIcon /> Add webhook
        </Button>
      </div>
    </div>
  );
}

function FormSettings({
  meta,
  theme,
  themes,
  fields,
  onUpdateMeta,
  onSettingsChange,
  onThemeChange,
}: {
  meta: FormBuilderMeta;
  theme: BuilderTheme | null;
  themes: BuilderTheme[];
  fields: { id: string; label: string; type: FieldType }[];
  onUpdateMeta: (patch: Partial<FormBuilderMeta>) => void;
  onSettingsChange: (patch: Partial<BuilderFormSettings>) => void;
  onThemeChange: (t: BuilderTheme | null) => void;
}) {
  const settings = meta.settings ?? {};
  const [passwordDraft, setPasswordDraft] = useState("");
  const [slugDraft, setSlugDraft] = useState(meta.slug);
  const hasPassword = Boolean(settings.password);
  const emailFields = fields.filter((f) => f.type === "email");

  useEffect(() => {
    setSlugDraft(meta.slug);
  }, [meta.slug]);

  const commitSlug = () => {
    const cleaned = slugify(slugDraft);
    if (!cleaned) {
      setSlugDraft(meta.slug);
      return;
    }
    if (cleaned === meta.slug) return;
    onUpdateMeta({ slug: cleaned });
  };

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
        <Label htmlFor="form-slug">Custom URL</Label>
        <div className="bg-muted/40 flex items-center gap-1 rounded-md border px-3 text-sm text-muted-foreground">
          <span className="shrink-0">/form/</span>
          <input
            id="form-slug"
            className="text-foreground min-w-0 flex-1 bg-transparent outline-none"
            value={slugDraft}
            onChange={(e) => setSlugDraft(e.target.value)}
            onBlur={commitSlug}
            placeholder="my-form"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Lowercase letters, numbers and hyphens. Changing it breaks any old
          shared links.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="form-custom-domain">Custom domain</Label>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground shrink-0 text-sm">https://</span>
          <Input
            id="form-custom-domain"
            placeholder="forms.yourbrand.com"
            value={meta.customDomain ?? ""}
            onChange={(e) => onUpdateMeta({ customDomain: e.target.value })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Point a subdomain or apex at the app and it will open this form
          directly at the root with no /form/ path. Clear it to remove.
        </p>
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

      <Separator />

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Start &amp; end screens</p>

        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="form-start-screen">Show a start screen</Label>
            <p className="text-xs text-muted-foreground">
              Display a welcome screen before the first question.
            </p>
          </div>
          <Switch
            id="form-start-screen"
            checked={settings.startScreen?.enabled === true}
            onCheckedChange={(checked) =>
              onSettingsChange({
                startScreen: {
                  ...(settings.startScreen ?? {}),
                  enabled: checked,
                },
              })
            }
          />
        </div>

        {settings.startScreen?.enabled ? (
          <div className="flex flex-col gap-3 rounded-md border p-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="form-start-title">Title</Label>
              <Input
                id="form-start-title"
                value={settings.startScreen?.title ?? ""}
                placeholder="Welcome"
                onChange={(e) =>
                  onSettingsChange({
                    startScreen: {
                      ...(settings.startScreen ?? {}),
                      title: e.target.value,
                    },
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="form-start-desc">Description</Label>
              <Textarea
                id="form-start-desc"
                rows={3}
                value={settings.startScreen?.description ?? ""}
                placeholder="Introductory text shown on the welcome screen"
                onChange={(e) =>
                  onSettingsChange({
                    startScreen: {
                      ...(settings.startScreen ?? {}),
                      description: e.target.value,
                    },
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="form-start-btn">Button label</Label>
              <Input
                id="form-start-btn"
                value={settings.startScreen?.buttonLabel ?? ""}
                placeholder="Start"
                onChange={(e) =>
                  onSettingsChange({
                    startScreen: {
                      ...(settings.startScreen ?? {}),
                      buttonLabel: e.target.value,
                    },
                  })
                }
              />
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="form-end-enabled">Custom end screen</Label>
              <p className="text-xs text-muted-foreground">
                Shown after submission. When off, the default thank-you screen
                is used.
              </p>
            </div>
            <Switch
              id="form-end-enabled"
              checked={settings.endScreen?.enabled === true}
              onCheckedChange={(checked) =>
                onSettingsChange({
                  endScreen: {
                    ...(settings.endScreen ?? {}),
                    enabled: checked,
                  },
                })
              }
            />
          </div>
          {settings.endScreen?.enabled ? (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="form-end-title">Title</Label>
                <Input
                  id="form-end-title"
                  value={settings.endScreen?.title ?? ""}
                  placeholder="Thank you!"
                  onChange={(e) =>
                    onSettingsChange({
                      endScreen: {
                        ...(settings.endScreen ?? {}),
                        title: e.target.value,
                      },
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="form-end-message">Message</Label>
                <Textarea
                  id="form-end-message"
                  rows={2}
                  value={settings.endScreen?.message ?? ""}
                  placeholder="Your response has been recorded."
                  onChange={(e) =>
                    onSettingsChange({
                      endScreen: {
                        ...(settings.endScreen ?? {}),
                        message: e.target.value,
                      },
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="form-end-btn">Button label</Label>
                <Input
                  id="form-end-btn"
                  value={settings.endScreen?.buttonLabel ?? ""}
                  placeholder="Submit another response"
                  onChange={(e) =>
                    onSettingsChange({
                      endScreen: {
                        ...(settings.endScreen ?? {}),
                        buttonLabel: e.target.value,
                      },
                    })
                  }
                />
              </div>
            </>
          ) : null}
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Email notifications</p>

        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="form-notify">Email me on responses</Label>
            <p className="text-xs text-muted-foreground">
              Send a notification each time someone submits.
            </p>
          </div>
          <Switch
            id="form-notify"
            checked={settings.notifyOnResponse !== false}
            onCheckedChange={(checked) =>
              onSettingsChange({ notifyOnResponse: checked })
            }
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="form-notify-email">Notification email</Label>
          <Input
            id="form-notify-email"
            type="email"
            placeholder="you@example.com"
            value={settings.notificationEmail ?? ""}
            onChange={(e) =>
              onSettingsChange({ notificationEmail: e.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to use the email address of your account.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="form-confirm">Send confirmation emails</Label>
            <p className="text-xs text-muted-foreground">
              Email respondents a copy of their answers.
            </p>
          </div>
          <Switch
            id="form-confirm"
            checked={settings.sendConfirmation === true}
            onCheckedChange={(checked) =>
              onSettingsChange({ sendConfirmation: checked })
            }
          />
        </div>

        {settings.sendConfirmation ? (
          emailFields.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="form-confirm-field">Email field to use</Label>
              <Select
                value={settings.confirmationEmailFieldId ?? "__none__"}
                onValueChange={(value) =>
                  onSettingsChange({
                    confirmationEmailFieldId: value === "__none__" ? null : value,
                  })
                }
              >
                <SelectTrigger id="form-confirm-field" className="w-full">
                  <SelectValue placeholder="Select an email field" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground">No email field</span>
                  </SelectItem>
                  {emailFields.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add an Email field to your form to choose where confirmations are
              sent.
            </p>
          )
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <WebhooksSettings formId={meta.id} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label>Form layout</Label>
          <p className="text-xs text-muted-foreground">
            Choose how questions are presented to the visitor.
          </p>
        </div>
        <RadioGroup
          value={settings.stepMode ?? "all"}
          onValueChange={(value) =>
            onSettingsChange({ stepMode: value as "all" | "page" | "question" })
          }
          className="gap-2"
        >
          {[
            {
              value: "all",
              title: "All on one page",
              hint: "Show every question together, then submit once.",
            },
            {
              value: "question",
              title: "One at a time",
              hint: "Show a single question per screen, continue with Next.",
            },
            {
              value: "page",
              title: "One page per section",
              hint: "Group questions into pages with page breaks.",
            },
          ].map((option) => (
            <Label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 font-normal transition-colors",
                (settings.stepMode ?? "all") === option.value
                  ? "border-violet-500/40 bg-violet-500/10"
                  : "border-border/60 bg-white/[0.02] hover:bg-white/[0.04]",
              )}
            >
              <RadioGroupItem value={option.value} className="mt-0.5" />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{option.title}</span>
                <span className="text-muted-foreground text-xs">
                  {option.hint}
                </span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="form-password">Password protection</Label>
        {hasPassword ? (
          <p className="text-muted-foreground text-xs">
            A password is currently set. Visitors must enter it before opening
            the form.
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <Input
            id="form-password"
            type="password"
            placeholder={
              hasPassword
                ? "Leave blank to keep current password"
                : "No password set"
            }
            value={passwordDraft}
            onChange={(e) => setPasswordDraft(e.target.value)}
          />
          {hasPassword ? (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                onSettingsChange({ password: undefined });
                setPasswordDraft("");
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
        {passwordDraft ? (
          <Button
            size="sm"
            type="button"
            onClick={() => {
              onSettingsChange({ password: passwordDraft });
              setPasswordDraft("");
            }}
          >
            {hasPassword ? "Update password" : "Set password"}
          </Button>
        ) : null}
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
