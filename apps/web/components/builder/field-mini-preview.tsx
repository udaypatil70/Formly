import type { BuilderField } from "~/lib/builder-types";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
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
    case "phone":
      return (
        <Input
          defaultValue=""
          disabled
          type="tel"
          placeholder={field.placeholder ?? "+1 555 000 0000"}
        />
      );
    case "url":
      return (
        <Input
          defaultValue=""
          disabled
          type="url"
          placeholder={field.placeholder ?? "https://example.com"}
        />
      );
    case "time":
      return <Input defaultValue="" disabled type="time" />;
    case "file_upload":
      return <Input defaultValue="" disabled placeholder="No file chosen" />;
    case "payment": {
      const amount = field.validationRules?.amount;
      return (
        <Input
          disabled
          value=""
          placeholder={
            amount ? `Pay ₹${amount} (Razorpay)` : "Set an amount in settings"
          }
        />
      );
    }
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
  if (field.type === "scale") {
    const min = field.validationRules?.min ?? 1;
    const max = field.validationRules?.max ?? 10;
    return (
      <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {Array.from({ length: Math.max(max - min + 1, 0) }).map((_, i) => (
          <span
            key={min + i}
            className="flex size-7 items-center justify-center rounded-full border text-xs"
          >
            {min + i}
          </span>
        ))}
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
  if (field.type === "radio" && field.options) {
    return (
      <RadioGroup defaultValue="" disabled className="gap-1.5">
        {field.options.map((o) => (
          <Label
            key={o.value}
            className="flex items-center gap-2 font-normal text-sm text-muted-foreground"
          >
            <RadioGroupItem value={o.value} disabled />
            {o.label}
          </Label>
        ))}
      </RadioGroup>
    );
  }
  return null;
}
