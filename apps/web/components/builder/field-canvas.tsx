import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CopyIcon,
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import type { BuilderField } from "~/lib/builder-types";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { FieldMiniPreview, FieldStaticPreview } from "./field-mini-preview";

interface FieldCanvasProps {
  fields: BuilderField[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

function SortableFieldItem({
  field,
  selected,
  isOver,
  onSelect,
  onDelete,
  onDuplicate,
}: {
  field: BuilderField;
  selected: boolean;
  isOver: boolean;
  onSelect: (id: string) => void;
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
        {field.type === "single_select" ||
        field.type === "multi_select" ||
        field.type === "radio" ||
        field.type === "rating" ||
        field.type === "checkbox" ? (
          <FieldStaticPreview field={field} />
        ) : (
          <FieldMiniPreview field={field} />
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{field.required ? "Required" : "Optional"}</span>
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
}: FieldCanvasProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: "canvas",
    data: { accepts: "field" },
  });

  const ordered = [...fields].sort((a, b) => a.order - b.order);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center border-b px-4 text-sm font-medium">
        Form
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
                  isOver={isOver}
                  onSelect={onSelect}
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
