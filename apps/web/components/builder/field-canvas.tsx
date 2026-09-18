import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckSquare2Icon,
  CopyIcon,
  GripVerticalIcon,
  PlusIcon,
  SeparatorHorizontalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import type { BuilderField } from "~/lib/builder-types";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { FieldMiniPreview, FieldStaticPreview } from "./field-mini-preview";

interface FieldCanvasProps {
  fields: BuilderField[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  onClearSelected: () => void;
  onDeleteSelected: (ids: string[]) => void;
}

function SortableFieldItem({
  field,
  selected,
  isOver,
  isSelected,
  onSelect,
  onToggleSelected,
  onDelete,
  onDuplicate,
}: {
  field: BuilderField;
  selected: boolean;
  isOver: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onToggleSelected: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={() => onSelect(field.id)}
      className={cn(
        "group rounded-lg border bg-card p-4 transition-shadow",
        selected && "ring-2 ring-primary",
        isSelected && "border-primary bg-accent/30",
        isDragging && "z-10 opacity-80 shadow-lg",
        isOver && "border-primary",
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="Drag to reorder"
          {...listeners}
          {...attributes}
        >
          <GripVerticalIcon className="size-4" />
        </button>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelected(field.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${field.label}`}
        />
        <span className="text-sm font-medium">{field.label}</span>
        <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(field.id);
            }}
            aria-label="Duplicate field"
          >
            <CopyIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(field.id);
            }}
            aria-label="Delete field"
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>

      <div className="mb-2">
        {field.type === "page_break" ? (
          <div className="flex items-center gap-3 py-0.5 text-muted-foreground">
            <span className="h-px flex-1 border-t border-dashed" />
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide">
              <SeparatorHorizontalIcon className="size-3.5" />
              {field.label || "Page break"}
            </span>
            <span className="h-px flex-1 border-t border-dashed" />
          </div>
        ) : field.type === "single_select" ||
          field.type === "multi_select" ||
          field.type === "radio" ||
          field.type === "rating" ||
          field.type === "scale" ||
          field.type === "checkbox" ? (
          <FieldStaticPreview field={field} />
        ) : (
          <FieldMiniPreview field={field} />
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {field.type === "page_break"
            ? "Starts a new page"
            : field.required
              ? "Required"
              : "Optional"}
        </span>
        <span className="capitalize">{field.type.replace("_", " ")}</span>
      </div>
    </div>
  );
}

export function FieldCanvas({
  fields,
  selectedId,
  onSelect,
  onDelete,
  onDuplicate,
  selectedIds,
  onToggleSelected,
  onClearSelected,
  onDeleteSelected,
}: FieldCanvasProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: "canvas",
    data: { accepts: "field" },
  });

  const ordered = [...fields].sort((a, b) => a.order - b.order);
  const bulkCount = selectedIds.size;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <span className="text-sm font-medium">Form</span>
        {bulkCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckSquare2Icon className="size-3.5" />
              {bulkCount} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDeleteSelected([...selectedIds])}
              className="text-destructive hover:text-destructive"
            >
              <Trash2Icon /> Delete
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClearSelected}
              aria-label="Clear selection"
            >
              <XIcon />
            </Button>
          </div>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto p-4",
          isOver && "bg-accent/40",
        )}
      >
        {ordered.length === 0 ? (
          <div
            className={cn(
              "flex h-full min-h-48 flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors",
              isOver && "border-primary bg-accent/40",
            )}
          >
            <PlusIcon className="mb-2 size-6 text-muted-foreground" />
            <p className="text-sm font-medium">
              Drag fields here to start building
            </p>
            <p className="text-xs text-muted-foreground">
              Or drop a field type from the left panel
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <SortableContext
              items={ordered.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              {ordered.map((field) => (
                <SortableFieldItem
                  key={field.id}
                  field={field}
                  selected={selectedId === field.id}
                  isSelected={selectedIds.has(field.id)}
                  isOver={isOver}
                  onSelect={onSelect}
                  onToggleSelected={onToggleSelected}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                />
              ))}
            </SortableContext>
          </div>
        )}
      </div>
    </div>
  );
}