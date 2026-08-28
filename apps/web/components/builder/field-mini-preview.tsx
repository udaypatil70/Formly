"use client";

import type { BuilderField } from "~/lib/builder-types";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

interface FieldMiniPreviewProps {
  field: BuilderField;
  onUpdate?: (id: string, patch: Partial<BuilderField>) => void;
}

export function FieldMiniPreview({ field }: FieldMiniPreviewProps) {
  switch (field.type) {
    case "long_text":
      return (
        <Textarea
          defaultValue=""
          disabled
          className="opacity-80"
          placeholder={field.placeholder ?? "Long answer"}
        />
      );
    case "email":
      return <Input defaultValue="" disabled placeholder="name@example.com" />;
    case "number":
      return <Input defaultValue="" disabled placeholder="0" />;
    case "date":
      return <Input defaultValue="" disabled type="date" />;
    case "short_text":
    default:
      return (
        <Input
          defaultValue=""
          disabled
          placeholder={field.placeholder ?? "Short answer"}
        />
      );
  }
}

/** Renders static option previews for select/rating/checkbox types. */
export function FieldStaticPreview({ field }: { field: BuilderField }) {
  if (field.type === "rating") {
    return (
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        {"★★★★★".slice(0, 5)}
      </div>
    );
  }
  if (field.type === "checkbox") {
    return (
      <Label className="flex items-center gap-2 font-normal text-sm text-muted-foreground">
        <Checkbox defaultChecked={false} disabled />
        {field.label}
      </Label>
    );
  }
  if (field.type === "multi_select" && field.options) {
    return (
      <div className="flex flex-col gap-1">
        {field.options.map((o) => (
          <Label
            key={o.value}
            className="flex items-center gap-2 font-normal text-sm text-muted-foreground"
          >
            <Checkbox defaultChecked={false} disabled />
            {o.label}
          </Label>
        ))}
      </div>
    );
  }
  if (field.type === "single_select" && field.options) {
    return (
      <Input
        defaultValue=""
        disabled
        value=""
        placeholder={field.options[0]?.label ?? "Select an option"}
      />
    );
  }
  return null;
}
