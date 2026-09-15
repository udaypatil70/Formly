import { useState } from "react";
import type { CSSProperties } from "react";
import {
  CheckIcon,
  Paintbrush2Icon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "~/trpc/client";
import type {
  BuilderTheme,
  BuilderThemeBackground,
} from "~/lib/builder-types";
import {
  DEFAULT_THEME_COLORS,
  THEME_FONTS,
  backgroundStyle,
  fontFamilyFor,
} from "~/lib/theme-utils";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
import type { FormBuilderMeta } from "./form-builder";

interface ThemeSectionProps {
  themes: BuilderTheme[];
  selected: BuilderTheme | null;
  meta: FormBuilderMeta;
  onSelect: (theme: BuilderTheme | null) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  anime: "Anime",
  movies: "Movies",
  games: "Games",
  startups: "Startups",
  tech: "Tech",
  os: "OS",
  events: "Events",
  community: "Community",
};
const CATEGORY_VALUES = [
  "anime",
  "movies",
  "games",
  "startups",
  "tech",
  "os",
  "events",
  "community",
] as const;
type CategoryValue = (typeof CATEGORY_VALUES)[number];

export function ThemeSection({
  themes,
  selected,
  meta,
  onSelect,
}: ThemeSectionProps) {
  const [editing, setEditing] = useState<
    { mode: "create" } | { mode: "edit"; theme: BuilderTheme } | null
  >(null);

  const builtIn = themes.filter((t) => !t.ownerId);
  const mine = themes.filter((t) => t.ownerId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Label>Theme</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditing({ mode: "create" })}
        >
          <PlusIcon /> Custom
        </Button>
      </div>

      <ThemePreviewCard theme={selected} title={meta.title} />

      {mine.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            My themes
          </span>
          <div className="grid grid-cols-2 gap-2">
            {mine.map((t) => (
              <ThemeSwatch
                key={t.id}
                theme={t}
                active={selected?.id === t.id}
                onSelect={(th) => onSelect(th)}
                onEdit={() => setEditing({ mode: "edit", theme: t })}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Built-in themes
        </span>
        <div className="grid grid-cols-2 gap-2">
          {builtIn.map((t) => (
            <ThemeSwatch
              key={t.id}
              theme={t}
              active={selected?.id === t.id}
              onSelect={(th) => onSelect(th)}
              onEdit={undefined}
            />
          ))}
        </div>
      </div>

      {editing ? (
        <ThemeEditorDialog
          mode={editing.mode}
          initial={editing.mode === "edit" ? editing.theme : undefined}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            onSelect(saved);
          }}
        />
      ) : null}
    </div>
  );
}

function ThemeSwatch({
  theme,
  active,
  onSelect,
  onEdit,
}: {
  theme: BuilderTheme;
  active: boolean;
  onSelect: (theme: BuilderTheme) => void;
  onEdit?: (() => void) | undefined;
}) {
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-1 rounded-md border bg-card p-1.5 transition-colors",
        active ? "border-primary" : "hover:border-border",
      )}
    >
      <button
        type="button"
        className={cn(
          "flex flex-col gap-1 rounded p-1 text-left transition-colors",
          !active && "hover:bg-accent",
        )}
        onClick={() => onSelect(theme)}
      >
        <span
          className="h-7 w-full rounded"
          style={{ background: swatchGradient(theme) }}
        />
        <span className="truncate text-xs">
          {theme.name}
          {theme.category ? (
            <span className="ml-1 text-[10px] text-muted-foreground">
              {CATEGORY_LABELS[theme.category] ?? theme.category}
            </span>
          ) : null}
        </span>
      </button>
      {onEdit ? (
        <button
          type="button"
          aria-label={`Edit ${theme.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
        >
          <PencilIcon className="size-3.5" />
        </button>
      ) : null}
      {active ? (
        <CheckIcon className="pointer-events-none absolute left-2.5 top-3 size-4 text-white drop-shadow" />
      ) : null}
    </div>
  );
}

/** Scaled-down preview of the public form using the live theme values. */
export function ThemePreviewCard({
  theme,
  title,
}: {
  theme: BuilderTheme | null;
  title: string;
}) {
  const colors = theme?.colors ?? DEFAULT_THEME_COLORS;
  const font = fontFamilyFor(theme?.font);

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ ...backgroundStyle(theme), color: colors.text, fontFamily: font }}
    >
      <div className="p-4">
        <div className="truncate text-sm font-semibold">{title || "Untitled form"}</div>
        <div
          className="mt-1 h-2 w-3/4 rounded-sm"
          style={{ backgroundColor: colors.text, opacity: 0.25 }}
        />
        <div className="mt-4 flex flex-col gap-2">
          <div className="h-6 w-full rounded-md" style={skeletonFieldStyle(colors.text)} />
          <div className="h-6 w-2/3 rounded-md" style={skeletonFieldStyle(colors.text)} />
          <div className="flex items-center gap-1 pt-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className="size-3 rounded-sm"
                style={{ backgroundColor: colors.text, opacity: 0.3 }}
              />
            ))}
          </div>
          <div
            className="mt-1 h-7 w-full rounded-md"
            style={{ backgroundColor: colors.primary }}
          />
        </div>
      </div>
    </div>
  );
}

type BackgroundMode = "none" | "solid" | "gradient" | "image";

function ThemeEditorDialog({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: BuilderTheme;
  onClose: () => void;
  onSaved: (theme: BuilderTheme) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<CategoryValue>(
    (CATEGORY_VALUES as readonly string[]).includes(initial?.category ?? "")
      ? (initial!.category as CategoryValue)
      : "community",
  );
  const [font, setFont] = useState<string>(initial?.font || "Inter");
  const [colors, setColors] = useState({
    primary: initial?.colors.primary ?? DEFAULT_THEME_COLORS.primary,
    background: initial?.colors.background ?? DEFAULT_THEME_COLORS.background,
    surface: initial?.colors.surface ?? DEFAULT_THEME_COLORS.surface,
    text: initial?.colors.text ?? DEFAULT_THEME_COLORS.text,
  });
  const bg = initial?.background;
  const [bgMode, setBgMode] = useState<BackgroundMode>(
    bg?.type ?? "none",
  );
  const [solidColor, setSolidColor] = useState(bg?.type === "solid" ? bg.color : "");
  const [gradFrom, setGradFrom] = useState(bg?.type === "gradient" ? bg.from : "");
  const [gradTo, setGradTo] = useState(bg?.type === "gradient" ? bg.to : "");
  const [imageUrl, setImageUrl] = useState(bg?.type === "image" ? bg.url : "");

  const create = trpc.theme.create.useMutation();
  const update = trpc.theme.update.useMutation();
  const remove = trpc.theme.delete.useMutation();
  const utils = trpc.useUtils();

  const saving = create.isPending || update.isPending;

  const buildBackground = (): BuilderThemeBackground | undefined => {
    switch (bgMode) {
      case "solid":
        return solidColor ? { type: "solid", color: solidColor } : undefined;
      case "gradient":
        return gradFrom && gradTo
          ? { type: "gradient", from: gradFrom, to: gradTo }
          : undefined;
      case "image":
        return imageUrl.trim()
          ? { type: "image", url: imageUrl.trim() }
          : undefined;
      default:
        return undefined;
    }
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Give your theme a name");
      return;
    }
    const payload = {
      name: trimmed,
      category,
      font: font === "system" ? undefined : font,
      colors,
      background: buildBackground(),
    };
    try {
      if (mode === "create") {
        const saved = await create.mutateAsync(payload);
        onSaved(mapTheme(saved));
      } else if (initial?.id) {
        const saved = await update.mutateAsync({ id: initial.id, ...payload });
        onSaved(mapTheme(saved));
      }
      await utils.theme.getAll.invalidate();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save theme";
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!initial?.id) return;
    if (!window.confirm(`Delete theme "${initial.name ?? ""}"?`)) return;
    try {
      await remove.mutateAsync({ id: initial.id });
      await utils.theme.getAll.invalidate();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to delete theme";
      toast.error(message);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create custom theme" : "Edit custom theme"}
          </DialogTitle>
          <DialogDescription>
            Pick colors, a font, and a background. The preview updates live.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <ThemePreviewCard
            theme={{
              name,
              category,
              font,
              colors,
              background: buildBackground(),
            }}
            title="Theme preview"
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="theme-name">Name</Label>
            <Input
              id="theme-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Midnight Galaxy"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="theme-category">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as CategoryValue)}>
              <SelectTrigger id="theme-category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {CATEGORY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Colors</Label>
            <div className="grid grid-cols-2 gap-3">
              <ColorField
                label="Primary"
                value={colors.primary}
                onChange={(v) => setColors((c) => ({ ...c, primary: v }))}
              />
              <ColorField
                label="Background"
                value={colors.background}
                onChange={(v) => setColors((c) => ({ ...c, background: v }))}
              />
              <ColorField
                label="Surface (card)"
                value={colors.surface}
                onChange={(v) => setColors((c) => ({ ...c, surface: v }))}
              />
              <ColorField
                label="Text"
                value={colors.text}
                onChange={(v) => setColors((c) => ({ ...c, text: v }))}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="theme-font">Font</Label>
            <Select value={font === "system" ? "system" : font} onValueChange={setFont}>
              <SelectTrigger id="theme-font">
                <SelectValue placeholder="Select a font" />
              </SelectTrigger>
              <SelectContent>
                {THEME_FONTS.map((f) => (
                  <SelectItem key={f.family} value={f.family}>
                    <span style={{ fontFamily: f.css }}>{f.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Background</Label>
            <div className="flex flex-wrap gap-1.5">
              {(["none", "solid", "gradient", "image"] as BackgroundMode[]).map(
                (m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setBgMode(m)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs capitalize transition-colors",
                      bgMode === m
                        ? "border-primary bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {m === "none" ? "None" : m}
                  </button>
                ),
              )}
            </div>
            {bgMode === "solid" && (
              <ColorField label="Solid color" value={solidColor} onChange={setSolidColor} />
            )}
            {bgMode === "gradient" && (
              <div className="flex gap-2">
                <ColorField label="From" value={gradFrom} onChange={setGradFrom} />
                <ColorField label="To" value={gradTo} onChange={setGradTo} />
              </div>
            )}
            {bgMode === "image" && (
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://… (image URL)"
              />
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2">
          <div>
            {mode === "edit" && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={remove.isPending}
              >
                <Trash2Icon /> Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Paintbrush2Icon />
              {mode === "create" ? "Create theme" : "Save changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1.5 rounded-md border px-1.5">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="size-6 cursor-pointer appearance-none border-none bg-transparent p-0"
          aria-label={`${label} picker`}
        />
        <Input
          className="border-none px-1 py-1 font-mono text-xs shadow-none focus-visible:ring-0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

function skeletonFieldStyle(text: string): CSSProperties {
  return {
    border: `1px solid ${text}33`,
    backgroundColor: `${text}12`,
  };
}

function swatchGradient(theme: BuilderTheme): string {
  const c = theme.colors;
  return `linear-gradient(135deg, ${c.primary}, ${c.surface})`;
}

export function mapTheme(
  t: {
    id: string;
    name: string;
    category: string;
    font?: string | null;
    colors: BuilderTheme["colors"];
    background?: BuilderThemeBackground | null;
    ownerId?: string | null;
  },
): BuilderTheme {
  return {
    id: t.id,
    name: t.name,
    category: t.category,
    font: t.font ?? null,
    colors: t.colors,
    background: t.background ?? null,
    ownerId: t.ownerId ?? null,
  };
}