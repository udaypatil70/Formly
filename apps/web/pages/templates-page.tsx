import { useDeferredValue, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlignLeftIcon,
  CalendarIcon,
  CheckSquare2Icon,
  ChevronDownIcon,
  CircleDotIcon,
  HashIcon,
  LayoutTemplateIcon,
  ListChecksIcon,
  MailIcon,
  PlusIcon,
  SeparatorHorizontalIcon,
  StarIcon,
  TypeIcon,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "~/trpc/client";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Skeleton } from "~/components/ui/skeleton";
import { SiteFooter } from "~/components/marketing/site-footer";
import { SiteHeader } from "~/components/marketing/site-header";
import { cn } from "~/lib/utils";

const CATEGORIES = [
  { value: "feedback", label: "Feedback" },
  { value: "sales", label: "Sales" },
  { value: "education", label: "Education" },
  { value: "health", label: "Health" },
  { value: "events", label: "Events" },
  { value: "product", label: "Product" },
  { value: "careers", label: "Careers" },
  { value: "community", label: "Community" },
  { value: "it", label: "IT" },
] as const;

type CategoryValue = (typeof CATEGORIES)[number]["value"];

const FIELD_TYPE_LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  short_text: { label: "Short text", icon: TypeIcon },
  long_text: { label: "Paragraph", icon: AlignLeftIcon },
  email: { label: "Email", icon: MailIcon },
  number: { label: "Number", icon: HashIcon },
  single_select: { label: "Dropdown", icon: ChevronDownIcon },
  multi_select: { label: "Multiple choice", icon: ListChecksIcon },
  checkbox: { label: "Checkbox", icon: CheckSquare2Icon },
  radio: { label: "Radio", icon: CircleDotIcon },
  rating: { label: "Rating", icon: StarIcon },
  date: { label: "Date", icon: CalendarIcon },
  page_break: { label: "Page break", icon: SeparatorHorizontalIcon },
};

export function TemplatesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [category, setCategory] = useState<CategoryValue | undefined>(undefined);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const session = trpc.auth.getSession.useQuery();
  const templatesQuery = trpc.template.listAll.useQuery({
    search: deferredSearch || undefined,
    category,
  });
  const previewQuery = trpc.template.getById.useQuery(
    { id: previewId ?? "" },
    { enabled: !!previewId },
  );
  const useTemplate = trpc.template.useTemplate.useMutation();

  const templates = templatesQuery.data?.templates ?? [];
  const isAuthed = !!session.data?.user;

  const handleUseTemplate = async (id: string) => {
    if (!isAuthed) {
      navigate("/login");
      return;
    }
    try {
      const form = await useTemplate.mutateAsync({ id });
      setPreviewId(null);
      toast.success("Template ready — make it yours");
      navigate(`/builder/${form.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to use template",
      );
    }
  };

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />

      <main className="flex-1">
        <section className="border-b border-border/60 bg-background">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <Badge
                variant="outline"
                className="border-violet-500/30 bg-violet-500/10 px-3 py-1 text-violet-300"
              >
                <LayoutTemplateIcon className="size-3" />
                Templates
              </Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                Start from a template
              </h1>
              <p className="text-muted-foreground mt-3 text-sm sm:text-base">
                Pick a ready-made form, drop in your branding and publish in
                minutes. Every template is fully editable.
              </p>
            </div>

            <div className="mx-auto mt-8 max-w-xl">
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCategory(undefined);
                }}
                placeholder="Search templates…"
                className="h-12 rounded-xl bg-card pr-12"
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <CategoryChip
                active={category === undefined}
                onClick={() => setCategory(undefined)}
              >
                All
              </CategoryChip>
              {CATEGORIES.map((item) => (
                <CategoryChip
                  key={item.value}
                  active={category === item.value}
                  onClick={() =>
                    setCategory(category === item.value ? undefined : item.value)
                  }
                >
                  {item.label}
                </CategoryChip>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          {templatesQuery.isLoading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-52 w-full rounded-xl" />
              ))}
            </div>
          ) : templatesQuery.isError ? (
            <Empty className="py-20">
              <EmptyHeader>
                <EmptyTitle>Failed to load templates</EmptyTitle>
                <EmptyDescription>
                  Couldn&apos;t reach the API server. Please try again.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : templates.length === 0 ? (
            <Empty className="py-20">
              <EmptyHeader>
                <EmptyTitle>No templates found</EmptyTitle>
                <EmptyDescription>
                  Try a different search term or category.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  id={template.id}
                  title={template.title}
                  description={template.description}
                  category={template.templateCategory}
                  fieldCount={template.fieldCount}
                  primary={template.colors?.primary}
                  background={template.colors?.background}
                  themedName={template.themeName}
                  busy={useTemplate.isPending}
                  onPreview={() => setPreviewId(template.id)}
                  onUse={() => void handleUseTemplate(template.id)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <SiteFooter />

      <Dialog open={!!previewId} onOpenChange={(open) => !open && setPreviewId(null)}>
        <DialogContent className="flex max-h-[85svh] flex-col gap-0 sm:max-w-lg">
          <DialogHeader className="px-6 pb-3 pt-6">
            <DialogTitle>{previewQuery.data?.form.title ?? "Template"}</DialogTitle>
            <DialogDescription className="line-clamp-2">
              {previewQuery.data?.form.description}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="min-h-0 flex-1 px-6">
            {previewQuery.isLoading ? (
              <div className="space-y-2 py-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : previewQuery.data ? (
              <div className="flex flex-col gap-2 py-2">
                {previewQuery.data.fields.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    This template has no fields yet.
                  </p>
                ) : (
                  previewQuery.data.fields.map((field) => {
                    const meta =
                      FIELD_TYPE_LABELS[field.type] ??
                      FIELD_TYPE_LABELS.short_text!;
                    const Icon = meta.icon;
                    return (
                      <div
                        key={field.id}
                        className="hover:bg-accent flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors"
                      >
                        <Icon className="text-muted-foreground size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">
                          {field.label}
                        </span>
                        {field.type === "page_break" ? null : field.required ? (
                          <span className="text-destructive shrink-0" title="Required">
                            *
                          </span>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Couldn&apos;t load this template.
              </p>
            )}
          </ScrollArea>

          <div className="flex items-center justify-between gap-3 border-t p-4">
            <span className="text-muted-foreground flex items-center gap-1.5 text-sm capitalize">
              {previewQuery.data?.form.templateCategory && (
                <Badge variant="secondary">
                  {previewQuery.data?.form.templateCategory}
                </Badge>
              )}
              <span>{previewQuery.data?.form.fieldCount} fields</span>
            </span>
            <Button
              onClick={() => previewId && handleUseTemplate(previewId)}
              disabled={useTemplate.isPending}
            >
              <PlusIcon />
              {useTemplate.isPending ? "Creating…" : "Use this template"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-muted-foreground hover:bg-accent h-8 rounded-full border px-3.5 text-sm font-medium transition-colors",
        active && "bg-primary text-primary-foreground border-transparent",
      )}
    >
      {children}
    </button>
  );
}

function TemplateCard({
  title,
  description,
  category,
  fieldCount,
  primary,
  background,
  themedName,
  busy,
  onPreview,
  onUse,
}: {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  fieldCount: number;
  primary?: string | null;
  background?: string | null;
  themedName?: string | null;
  busy: boolean;
  onPreview: () => void;
  onUse: () => void;
}) {
  const accent = primary ?? "#6d28d9";
  const dark = background ?? "#09090b";

  return (
    <Card className="group flex h-full flex-col overflow-hidden rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <button
        type="button"
        onClick={onPreview}
        className="text-left focus:outline-none"
      >
        <div
          className="relative flex h-20 items-end p-4"
          style={{
            background: `linear-gradient(135deg, ${accent}55, ${dark}00), linear-gradient(135deg, ${accent}, ${dark})`,
          }}
        >
          <span className="rounded-full border border-white/25 bg-black/25 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur capitalize">
            {category ?? "template"}
          </span>
        </div>
      </button>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className="font-semibold leading-snug tracking-tight line-clamp-1">
            {title}
          </h3>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed line-clamp-2">
            {description || "No description provided."}
          </p>
        </div>
        <div className="text-muted-foreground mt-auto flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5">
            {fieldCount} {fieldCount === 1 ? "field" : "fields"}
          </span>
          {themedName ? (
            <span className="flex items-center gap-1">
              <StarIcon className="size-3" />
              {themedName} theme
            </span>
          ) : null}
        </div>
        <Button size="sm" disabled={busy} onClick={onUse}>
          <PlusIcon />
          Use template
        </Button>
      </div>
    </Card>
  );
}