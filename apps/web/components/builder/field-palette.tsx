import {
  AlignLeftIcon,
  CalendarIcon,
  ChevronDownIcon,
  HashIcon,
  ListChecksIcon,
  MailIcon,
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
  { type: "rating", label: "Rating", icon: StarIcon },
  { type: "date", label: "Date", icon: CalendarIcon },
];

function PaletteItem({ type, label, icon: Icon }: (typeof PALETTE_ITEMS)[number]) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: { from: "palette", type },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
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

export function FieldPalette() {
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r md:flex">
      <div className="flex h-12 shrink-0 items-center px-4 text-sm font-medium">
        Field types
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1.5 px-3 pb-4">
          {PALETTE_ITEMS.map((item) => (
            <PaletteItem key={item.type} {...item} />
          ))}
        </div>
        <p className="px-3 pb-3 text-xs text-muted-foreground">
          Drag a field type onto the canvas to add it.
        </p>
      </ScrollArea>
    </aside>
  );
}
