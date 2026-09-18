import {
  AlignLeftIcon,
  CalendarIcon,
  ChevronDownIcon,
  CircleDotIcon,
  ClockIcon,
  FileUpIcon,
  GaugeIcon,
  HashIcon,
  LinkIcon,
  ListChecksIcon,
  MailIcon,
  PhoneIcon,
  SeparatorHorizontalIcon,
  SquareCheckIcon,
  StarIcon,
  TypeIcon,
} from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import type { FieldType } from "@repo/validators";

import { cn } from "~/lib/utils";
import { ScrollArea } from "~/components/ui/scroll-area";

export const PALETTE_ITEMS: {
  type: FieldType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { type: "short_text", label: "Short Text", icon: TypeIcon },
  { type: "long_text", label: "Paragraph", icon: AlignLeftIcon },
  { type: "email", label: "Email", icon: MailIcon },
  { type: "number", label: "Number", icon: HashIcon },
  { type: "single_select", label: "Dropdown", icon: ChevronDownIcon },
  { type: "multi_select", label: "Multiple Choice", icon: ListChecksIcon },
  { type: "checkbox", label: "Checkbox", icon: SquareCheckIcon },
  { type: "radio", label: "Radio", icon: CircleDotIcon },
  { type: "rating", label: "Rating", icon: StarIcon },
  { type: "scale", label: "Scale (NPS)", icon: GaugeIcon },
  { type: "date", label: "Date", icon: CalendarIcon },
  { type: "time", label: "Time", icon: ClockIcon },
  { type: "phone", label: "Phone", icon: PhoneIcon },
  { type: "url", label: "Website", icon: LinkIcon },
  { type: "file_upload", label: "File upload", icon: FileUpIcon },
  { type: "page_break", label: "Page break", icon: SeparatorHorizontalIcon },
];

export const PALETTE_GROUPS: {
  label: string;
  items: (typeof PALETTE_ITEMS)[number][];
}[] = [
  {
    label: "Basic fields",
    items: PALETTE_ITEMS.filter(({ type }) =>
      ["short_text", "long_text", "email", "number"].includes(type),
    ),
  },
  {
    label: "More",
    items: PALETTE_ITEMS.filter(({ type }) =>
      [
        "phone",
        "url",
        "date",
        "time",
        "single_select",
        "multi_select",
        "radio",
        "checkbox",
        "rating",
        "scale",
        "file_upload",
      ].includes(type),
    ),
  },
  {
    label: "Layout",
    items: PALETTE_ITEMS.filter(({ type }) => type === "page_break"),
  },
];

function PaletteItem({
  type,
  label,
  icon: Icon,
  onAdd,
}: (typeof PALETTE_ITEMS)[number] & { onAdd?: (type: FieldType) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: { from: "palette", type },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onAdd?.(type)}
      className={cn(
        "flex cursor-grab items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent",
        isDragging && "opacity-50",
      )}
      {...listeners}
      {...attributes}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function FieldPaletteContent({
  onAdd,
}: {
  onAdd?: (type: FieldType) => void;
}) {
  return (
    <div className="flex flex-col gap-4 px-3 pb-4">
      {PALETTE_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {group.label}
          </p>
          {group.items.map((item) => (
            <PaletteItem key={item.type} {...item} onAdd={onAdd} />
          ))}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Tap a field type to add it, or drag it onto the canvas.
      </p>
    </div>
  );
}

export function FieldPalette({ onAdd }: { onAdd?: (type: FieldType) => void }) {
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r lg:flex">
      <div className="flex h-12 shrink-0 items-center px-4 text-sm font-medium">
        Field types
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <FieldPaletteContent onAdd={onAdd} />
      </ScrollArea>
    </aside>
  );
}