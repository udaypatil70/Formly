import { useDeferredValue, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { TEMPLATE_CATEGORIES, type TemplateCategory } from "@repo/validators";

import { trpc } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Label } from "~/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "~/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Textarea } from "~/components/ui/textarea";

const PAGE_SIZE = 15;

const NONE = "none";
const STATUSES = ["draft", "published", "unpublished"] as const;

/** Template being edited in the dialog, or a blank one when creating. */
type Draft = {
  id: string | null;
  title: string;
  description: string;
  category: TemplateCategory | typeof NONE;
};

const blankDraft: Draft = { id: null, title: "", description: "", category: NONE };

export function AdminTemplatesPage() {
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);

  const templatesQuery = trpc.admin.listTemplates.useQuery(
    { page, pageSize: PAGE_SIZE, search: deferredSearch || undefined },
    { placeholderData: keepPreviousData },
  );

  const createTemplate = trpc.admin.createTemplate.useMutation();
  const updateTemplate = trpc.admin.updateTemplate.useMutation();
  const deleteTemplate = trpc.admin.deleteTemplate.useMutation();
  const setFeatured = trpc.admin.setFeatured.useMutation();

  const templates = templatesQuery.data?.templates ?? [];
  const total = templatesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const saving = createTemplate.isPending || updateTemplate.isPending;

  const refresh = () =>
    Promise.all([
      utils.admin.listTemplates.invalidate(),
      utils.admin.getStats.invalidate(),
      utils.public.getExploreForms.invalidate(),
      utils.template.listAll.invalidate(),
    ]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      await refresh();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  };

  const saveDraft = () => {
    if (!draft || !draft.title.trim()) return;
    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      category: draft.category === NONE ? null : draft.category,
    };
    const action = draft.id
      ? updateTemplate.mutateAsync({ id: draft.id, ...payload })
      : createTemplate.mutateAsync({
          title: payload.title,
          description: payload.description ?? undefined,
          category: payload.category ?? undefined,
        });
    void run(
      () => action,
      draft.id ? "Template updated" : "Template created",
    ).finally(() => setDraft(null));
  };

  /** Publishing is a status change on the same row, so it stays a one-click action. */
  const setStatus = (id: string, status: (typeof STATUSES)[number], title: string) =>
    run(
      () => updateTemplate.mutateAsync({ id, status }),
      status === "published" ? `${title} published` : `${title} moved to ${status}`,
    );

  const toggleFeatured = (id: string, next: boolean, title: string) =>
    run(
      () => setFeatured.mutateAsync({ id, featured: next }),
      next ? `${title} featured on Explore` : `${title} removed from Explore`,
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Templates seed the public catalogue. Publish one to make it visible.
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <SearchIcon className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search templates…"
              className="h-9 w-full pl-9"
            />
          </div>
          <Button size="sm" className="h-9" onClick={() => setDraft(blankDraft)}>
            <PlusIcon />
            New template
          </Button>
        </div>
      </div>

      {templatesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : templatesQuery.isError ? (
        <Empty className="py-20">
          <EmptyHeader>
            <EmptyTitle>Failed to load templates</EmptyTitle>
            <EmptyDescription>Please try again.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : templates.length === 0 ? (
        <Empty className="py-20">
          <EmptyHeader>
            <EmptyTitle>No templates found</EmptyTitle>
            <EmptyDescription>
              {deferredSearch ? "Try a different search term." : "Create one to get started."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="bg-card overflow-hidden rounded-lg border">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[38%]">Template</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Fields</TableHead>
                    <TableHead className="text-right">Featured</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="max-w-0 min-w-0">
                        <p className="truncate font-medium">{template.title}</p>
                        {template.description ? (
                          <p className="text-muted-foreground truncate text-xs">
                            {template.description}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={template.templateCategory ?? NONE}
                          onValueChange={(value) =>
                            void run(
                              () =>
                                updateTemplate.mutateAsync({
                                  id: template.id,
                                  category: value === NONE ? null : (value as TemplateCategory),
                                }),
                              "Category updated",
                            )
                          }
                          disabled={updateTemplate.isPending}
                        >
                          <SelectTrigger
                            className="h-8 w-32"
                            aria-label={`Category for ${template.title}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Uncategorised</SelectItem>
                            {TEMPLATE_CATEGORIES.map((category) => (
                              <SelectItem key={category} value={category}>
                                <span className="capitalize">{category}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={template.status}
                          onValueChange={(value) =>
                            void setStatus(
                              template.id,
                              value as (typeof STATUSES)[number],
                              template.title,
                            )
                          }
                          disabled={updateTemplate.isPending}
                        >
                          <SelectTrigger
                            className="h-8 w-32"
                            aria-label={`Status for ${template.title}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((value) => (
                              <SelectItem key={value} value={value}>
                                <span className="capitalize">{value}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {template.fieldCount}
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={template.isFeatured}
                          onCheckedChange={(checked) =>
                            void toggleFeatured(template.id, checked, template.title)
                          }
                          disabled={setFeatured.isPending}
                          aria-label={`Toggle featured for ${template.title}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8"
                            onClick={() =>
                              setDraft({
                                id: template.id,
                                title: template.title,
                                description: template.description ?? "",
                                category: (template.templateCategory as TemplateCategory) ?? NONE,
                              })
                            }
                          >
                            Edit
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive size-8"
                            aria-label={`Delete ${template.title}`}
                            onClick={() =>
                              setPendingDelete({ id: template.id, title: template.title })
                            }
                          >
                            <Trash2Icon />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <Pagination className="mt-6">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (page > 1) setPage(page - 1);
                  }}
                />
              </PaginationItem>
              <PaginationItem>
                <span className="text-muted-foreground text-sm tabular-nums">
                  Page {page} of {totalPages}
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (page < totalPages) setPage(page + 1);
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? "Edit template" : "New template"}
            </DialogTitle>
            <DialogDescription>
              Templates are form blueprints. Publish one to list it in the public
              catalogue.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="template-title">Title</Label>
              <Input
                id="template-title"
                value={draft?.title ?? ""}
                onChange={(e) =>
                  setDraft((current) =>
                    current ? { ...current, title: e.target.value } : current,
                  )
                }
                placeholder="Customer feedback form"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                rows={3}
                value={draft?.description ?? ""}
                onChange={(e) =>
                  setDraft((current) =>
                    current ? { ...current, description: e.target.value } : current,
                  )
                }
                placeholder="What this template is for"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="template-category">Category</Label>
              <Select
                value={draft?.category ?? NONE}
                onValueChange={(value) =>
                  setDraft((current) =>
                    current
                      ? { ...current, category: value as TemplateCategory }
                      : current,
                  )
                }
              >
                <SelectTrigger id="template-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Uncategorised</SelectItem>
                  {TEMPLATE_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      <span className="capitalize">{category}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveDraft} disabled={saving || !draft?.title.trim()}>
              {draft?.id ? "Save changes" : "Create template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Delete ${pendingDelete?.title ?? "this template"}?`}
        description="The template and its fields are removed. Forms already created from it are unaffected."
        confirmLabel="Delete template"
        destructive
        busy={deleteTemplate.isPending}
        onConfirm={() => {
          const target = pendingDelete;
          if (!target) return;
          void run(
            () => deleteTemplate.mutateAsync({ id: target.id }),
            "Template deleted",
          ).finally(() => setPendingDelete(null));
        }}
      />
    </div>
  );
}
