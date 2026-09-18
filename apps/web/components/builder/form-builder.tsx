import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  EyeIcon,
  HistoryIcon,
  Maximize2Icon,
  MousePointer2Icon,
  PlayIcon,
  PlusIcon,
  Redo2Icon,
  SaveIcon,
  Settings2Icon,
  Share2Icon,
  SquareIcon,
  Undo2Icon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { UpdateFieldInput } from "@repo/validators";

import { trpc } from "~/trpc/client";
import type {
  BuilderField,
  BuilderFormSettings,
  BuilderTheme,
} from "~/lib/builder-types";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { FieldCanvas } from "./field-canvas";
import { FieldPalette, FieldPaletteContent } from "./field-palette";
import { FieldInspector, FieldInspectorContent } from "./field-inspector";
import { PreviewDialog } from "./preview-dialog";
import { ShareDialog } from "~/components/share/share-dialog";
import { toUpdateInput, buildPublicForm } from "./utils";
import { VersionHistoryDialog } from "./version-history-dialog";

export interface FormBuilderMeta {
  id: string;
  title: string;
  description?: string | null;
  slug: string;
  status: string;
  visibility: string;
  themeId?: string | null;
  customDomain?: string | null;
  settings?: BuilderFormSettings;
}

interface FormBuilderProps {
  formId: string;
  initialMeta: FormBuilderMeta;
  initialFields: BuilderField[];
  initialTheme: BuilderTheme | null;
  /** Called after a version snapshot is restored; the page reloads fresh data. */
  onVersionRestored?: () => void;
}

const MAX_HISTORY = 100;

export function FormBuilder({
  formId,
  initialMeta,
  initialFields,
  initialTheme,
  onVersionRestored,
}: FormBuilderProps) {
  const navigate = useNavigate();
  const [meta, setMeta] = useState<FormBuilderMeta>(initialMeta);
  const [theme, setTheme] = useState<BuilderTheme | null>(initialTheme);
  const [fields, setFields] = useState<BuilderField[]>(() =>
    [...initialFields].sort((a, b) => a.order - b.order),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedField = fields.find((f) => f.id === selectedId) ?? null;

  // ─── Undo / redo history ─────────────────────────────────
  const pastRef = useRef<BuilderField[][]>([]);
  const futureRef = useRef<BuilderField[][]>([]);
  const [, setHistTick] = useState(0);
  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  const cloneFields = (list: BuilderField[]) => list.map((f) => ({ ...f }));
  const bumpHistory = () => setHistTick((t) => t + 1);

  const recordHistory = () => {
    pastRef.current.push(cloneFields(fields));
    if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
    futureRef.current = [];
    liveEditRef.current = null;
    bumpHistory();
  };

  const undo = () => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(cloneFields(fields));
    liveEditRef.current = null;
    setSelectedId(null);
    setFields(prev);
    bumpHistory();
  };

  const redo = () => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(cloneFields(fields));
    liveEditRef.current = null;
    setSelectedId(null);
    setFields(next);
    bumpHistory();
  };

  // ─── Mutations ───────────────────────────────────────────
  const addMutation = trpc.field.add.useMutation();
  const updateMutation = trpc.field.update.useMutation();
  const deleteMutation = trpc.field.delete.useMutation();
  const reorderMutation = trpc.field.reorder.useMutation();
  const formUpdate = trpc.form.update.useMutation();

  // ─── Debounced autosave for field edits ──────────────────
  const pendingRef = useRef<Record<string, UpdateFieldInput>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const flushField = (id: string) => {
    const input = pendingRef.current[id];
    if (!input) return;
    delete pendingRef.current[id];
    void updateMutation.mutateAsync(toUpdateInput(input)).catch((e) => {
      toast.error(e?.message ?? "Failed to save field");
    });
  };

  const scheduleFieldUpdate = (id: string, patch: UpdateFieldInput) => {
    pendingRef.current[id] = { ...pendingRef.current[id], ...patch, id };
    if (timersRef.current[id]) clearTimeout(timersRef.current[id]);
    timersRef.current[id] = setTimeout(() => flushField(id), 500);
  };

  // Groups consecutive keystrokes on the same field into a single undo step.
  const liveEditRef = useRef<{ fieldId: string | null } | null>(null);

  const updateField = (id: string, patch: Partial<BuilderField>) => {
    if (liveEditRef.current?.fieldId !== id) {
      recordHistory();
      liveEditRef.current = { fieldId: id };
    }
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    );
    setSaving(true);
    scheduleFieldUpdate(id, { ...patch } as UpdateFieldInput);
    // reflect saving state after debounce+flush
    setTimeout(() => setSaving(false), 700);
  };

  // ─── Field actions ───────────────────────────────────────
  const addField = (type: BuilderField["type"]) => {
    const order = fields.length;
    const tempId = crypto.randomUUID();
    const label = defaultLabel(type);
    recordHistory();
    setFields((prev) => [
      ...prev,
      {
        id: tempId,
        type,
        label,
        required: false,
        order,
        options:
          type === "single_select" ||
          type === "multi_select" ||
          type === "radio"
            ? [
                { label: "Option 1", value: "option-1", order: 0 },
                { label: "Option 2", value: "option-2", order: 1 },
              ]
            : undefined,
      },
    ]);
    setSelectedId(tempId);

    void addMutation
      .mutateAsync({ formId, type, label, required: false, order })
      .then((created) => {
        setFields((prev) =>
          prev.map((f) => (f.id === tempId ? { ...f, id: created.id } : f)),
        );
        if (pendingRef.current[tempId]) {
          pendingRef.current[created.id] = {
            ...pendingRef.current[tempId],
            id: created.id,
          };
          delete pendingRef.current[tempId];
          if (timersRef.current[tempId]) {
            clearTimeout(timersRef.current[tempId]);
            delete timersRef.current[tempId];
          }
          timersRef.current[created.id] = setTimeout(
            () => flushField(created.id),
            500,
          );
        }
        setSelectedId(created.id);
      })
      .catch((e) => {
        toast.error(e?.message ?? "Failed to add field");
        setFields((prev) => prev.filter((f) => f.id !== tempId));
      });
  };

  const deleteField = (id: string) => {
    recordHistory();
    setFields((prev) => prev.filter((f) => f.id !== id));
    if (selectedId === id) setSelectedId(null);
    setMultiSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    void deleteMutation.mutateAsync({ id }).catch((e) => {
      toast.error(e?.message ?? "Failed to delete field");
    });
  };

  const duplicateField = (id: string) => {
    const source = fields.find((f) => f.id === id);
    if (!source) return;
    const order = fields.length;
    const tempId = crypto.randomUUID();
    recordHistory();
    setFields((prev) => [
      ...prev,
      { ...source, id: tempId, label: `${source.label} (copy)`, order },
    ]);
    addMutation
      .mutateAsync({
        formId,
        type: source.type,
        label: `${source.label} (copy)`,
        required: source.required,
        order,
        placeholder: source.placeholder ?? undefined,
        helpText: source.helpText ?? undefined,
        validationRules: source.validationRules ?? undefined,
        conditionalLogic: source.conditionalLogic ?? undefined,
        options: source.options?.map((o, i) => ({
          label: o.label,
          value: o.value,
          order: i,
        })),
      })
      .then((created) => {
        setFields((prev) =>
          prev.map((f) => (f.id === tempId ? { ...f, id: created.id } : f)),
        );
      })
      .catch((e) => {
        toast.error(e?.message ?? "Failed to duplicate field");
        setFields((prev) => prev.filter((f) => f.id !== tempId));
      });
  };

  const reorderFields = (orderedIds: string[]) => {
    recordHistory();
    setFields((prev) => {
      const map = new Map(prev.map((f) => [f.id, f]));
      return orderedIds
        .map((id, order) => (map.has(id) ? { ...map.get(id)!, order } : null))
        .filter((f): f is BuilderField => f !== null);
    });
    void reorderMutation
      .mutateAsync({ formId, orderedIds })
      .catch((e) => toast.error(e?.message ?? "Failed to save order"));
  };

  // ─── Multi-select bulk delete ────────────────────────────
  const [multiSelected, setMultiSelected] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleSelected = (id: string) => {
    setMultiSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    setMultiSelected((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(fields.map((f) => f.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [fields]);

  const deleteSelected = (ids: string[]) => {
    if (ids.length === 0) return;
    recordHistory();
    setFields((prev) => prev.filter((f) => !ids.includes(f.id)));
    setMultiSelected(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    void Promise.allSettled(
      ids.map((id) => deleteMutation.mutateAsync({ id })),
    ).then((results) => {
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        toast.error(`Failed to delete ${failed.length} field(s)`);
      }
    });
  };

  // ─── Form metadata + settings ────────────────────────────
  const updateMeta = (patch: Partial<FormBuilderMeta>) => {
    setMeta((prev) => ({ ...prev, ...patch }));
    const clean: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value !== null && value !== undefined) clean[key] = String(value);
    }
    void formUpdate
      .mutateAsync({ ...clean, id: formId } as Parameters<typeof formUpdate.mutateAsync>[0])
      .catch((e) => {
        toast.error(e?.message ?? "Failed to save form");
      });
  };

  const updateSettings = (patch: Partial<BuilderFormSettings>) => {
    setMeta((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
    }));
    const settings: Record<string, unknown> = { ...meta.settings, ...patch };
    for (const [key, value] of Object.entries(settings)) {
      if (value === null || value === undefined || value === "") {
        delete settings[key];
      }
    }
    void formUpdate
      .mutateAsync({ id: formId, settings } as Parameters<typeof formUpdate.mutateAsync>[0])
      .catch((e) => {
        toast.error(e?.message ?? "Failed to save settings");
      });
  };

  // ─── Publish / unpublish ─────────────────────────────────
  const publishMutation = trpc.form.publish.useMutation();
  const unpublishMutation = trpc.form.unpublish.useMutation();
  const utils = trpc.useUtils();
  const publishBusy = publishMutation.isPending || unpublishMutation.isPending;

  const togglePublish = async (published: boolean) => {
    try {
      if (published) {
        await publishMutation.mutateAsync({ id: formId });
        toast.success("Form published");
      } else {
        await unpublishMutation.mutateAsync({ id: formId });
        toast.success("Form unpublished");
      }
      setMeta((prev) => ({
        ...prev,
        status: published ? "published" : "unpublished",
      }));
      await utils.form.getAllMine.invalidate();
      await utils.form.getById.invalidate({ id: formId });
      if (published) setShareOpen(true);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to update publish status",
      );
    }
  };

  // ─── Public preview data (reuses the same renderer) ──────
  const previewForm = useMemo(
    () => buildPublicForm(meta, fields, theme),
    [meta, fields, theme],
  );

  const isDirty = Object.keys(pendingRef.current).length > 0;

  // ─── Drag & drop (palette + reorder) ─────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [dragType, setDragType] = useState<BuilderField["type"] | null>(null);

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.from === "palette") {
      setDragType(data.type as BuilderField["type"]);
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDragType(null);

    if (active.data.current?.from === "palette") {
      const type = active.data.current.type as BuilderField["type"];
      if (type) addField(type);
      return;
    }

    if (!over || active.id === over.id) return;
    const ordered = [...fields].sort((a, b) => a.order - b.order).map((f) => f.id);
    const oldIndex = ordered.indexOf(String(active.id));
    const newIndex = ordered.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    reorderFields(arrayMove(ordered, oldIndex, newIndex));
  };

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => (window.location.href = "/")}
            aria-label="Back"
          >
            <Undo2Icon />
          </Button>
          <input
            value={meta.title}
            onChange={(e) => updateMeta({ title: e.target.value })}
            className="min-w-0 flex-1 border-none bg-transparent text-lg font-semibold outline-none md:w-80"
            placeholder="Untitled form"
          />
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
            {saving || isDirty ? (
              <>
                <SaveIcon className="size-3.5" /> Saving…
              </>
            ) : (
              "Saved"
            )}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={undo}
            disabled={!canUndo}
            aria-label="Undo"
            title="Undo"
          >
            <Undo2Icon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={redo}
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo"
          >
            <Redo2Icon />
          </Button>
          <StatusBadge status={meta.status} />
          {meta.status === "published" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500 hover:text-emerald-400"
                >
                  <CheckCircle2Icon />
                  Published
                  <ChevronDownIcon className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(`/form/${meta.slug}`)}>
                  <EyeIcon />
                  View live
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={publishBusy}
                  onClick={() => void togglePublish(false)}
                >
                  <SquareIcon />
                  Unpublish
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              size="sm"
              onClick={() => void togglePublish(true)}
              disabled={publishBusy}
              className="bg-violet-600 text-white shadow-lg shadow-violet-600/25 hover:bg-violet-500"
            >
              <PlayIcon />
              {publishMutation.isPending ? "Publishing…" : "Publish"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShareOpen(true)}
            aria-label="Share form"
          >
            <Share2Icon /> Share
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setHistoryOpen(true)}
            aria-label="Version history"
            title="Version history"
          >
            <HistoryIcon />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewOpen(true)}
          >
            <Maximize2Icon /> Preview
          </Button>
        </div>
      </header>

      {/* 3-panel layout */}
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragType(null)}
      >
        <div className="flex min-h-0 flex-1">
          <FieldPalette onAdd={addField} />
          <FieldCanvas
            fields={fields}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={deleteField}
            onDuplicate={duplicateField}
            selectedIds={multiSelected}
            onToggleSelected={toggleSelected}
            onClearSelected={() => setMultiSelected(new Set())}
            onDeleteSelected={deleteSelected}
          />
          <FieldInspector
            key={selectedField?.id ?? "none"}
            field={selectedField}
            fields={fields.map((f) => ({ id: f.id, label: f.label, type: f.type }))}
            theme={theme}
            meta={meta}
            onUpdateMeta={updateMeta}
            onSettingsChange={updateSettings}
            onThemeChange={(t) => {
              setTheme(t);
              void formUpdate
                .mutateAsync({ id: formId, themeId: t?.id })
                .catch(() => undefined);
            }}
            onUpdate={updateField}
            onDelete={deleteField}
          />
        </div>
        {dragType ? (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
            <div className="rounded-md border bg-background px-4 py-2 text-sm text-muted-foreground shadow-lg">
              Drop to add a {dragType.replace("_", " ")} field
            </div>
          </div>
        ) : null}
      </DndContext>

      {/* Mobile action bar */}
      <div className="flex items-center gap-2 border-t bg-background px-4 py-2.5 lg:hidden">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => setPaletteOpen(true)}
        >
          <PlusIcon /> Add field
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => setInspectorOpen(true)}
        >
          <Settings2Icon />
          {selectedField ? "Edit field" : "Form settings"}
        </Button>
      </div>

      {/* Mobile sheets */}
      <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[75svh] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>Field types</SheetTitle>
          </SheetHeader>
          <FieldPaletteContent
            onAdd={(type) => {
              addField(type);
              setPaletteOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85svh] overflow-hidden"
        >
          <SheetHeader>
            <SheetTitle>{selectedField ? "Field settings" : "Form settings"}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <FieldInspectorContent
              key={selectedField?.id ?? "none"}
              field={selectedField}
              fields={fields.map((f) => ({ id: f.id, label: f.label, type: f.type }))}
              theme={theme}
              meta={meta}
              onUpdateMeta={updateMeta}
              onSettingsChange={updateSettings}
              onThemeChange={(t) => {
                setTheme(t);
                void formUpdate
                  .mutateAsync({ id: formId, themeId: t?.id })
                  .catch(() => undefined);
              }}
              onUpdate={updateField}
              onDelete={deleteField}
            />
          </div>
        </SheetContent>
      </Sheet>

      <ShareDialog
        form={{
          id: formId,
          title: meta.title,
          slug: meta.slug,
          customDomain: meta.customDomain ?? null,
        }}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        form={previewForm}
      />

      <VersionHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        formId={formId}
        onRestored={onVersionRestored ?? (() => undefined)}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    unpublished: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    draft: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${styles[status] ?? ""}`}
    >
      <MousePointer2Icon className="mr-1 size-3" />
      {status}
    </span>
  );
}

function defaultLabel(type: BuilderField["type"]): string {
  switch (type) {
    case "short_text":
      return "Short answer";
    case "long_text":
      return "Long answer";
    case "email":
      return "Email";
    case "number":
      return "Number";
    case "single_select":
      return "Select an option";
    case "multi_select":
      return "Choose options";
    case "checkbox":
      return "Checkbox";
    case "radio":
      return "Multiple choice";
    case "rating":
      return "Rating";
    case "scale":
      return "Scale (e.g. 1-10)";
    case "date":
      return "Date";
    case "time":
      return "Time";
    case "phone":
      return "Phone number";
    case "url":
      return "Website";
    case "file_upload":
      return "File upload";
    case "payment":
      return "Payment";
    case "page_break":
      return "Page break";
    default:
      return "New field";
  }
}