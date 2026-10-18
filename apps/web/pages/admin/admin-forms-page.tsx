import { useDeferredValue, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  EyeOffIcon,
  MoreHorizontalIcon,
  SearchIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "~/trpc/client";
import { StatusBadge, VisibilityBadge } from "~/components/dashboard/form-status-badge";
import { Badge } from "~/components/ui/badge";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "~/components/ui/pagination";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";

const PAGE_SIZE = 15;

type StatusFilter = "all" | "draft" | "published" | "unpublished";

export function AdminFormsPage() {
  const utils = trpc.useUtils();

  const [view, setView] = useState<"all" | "explore">("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [status, setStatus] = useState<StatusFilter>("all");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);

  const formsQuery = trpc.admin.listForms.useQuery(
    {
      page,
      pageSize: PAGE_SIZE,
      search: deferredSearch || undefined,
      status: status === "all" ? undefined : status,
      featured: featuredOnly || undefined,
    },
    { enabled: view === "all", placeholderData: keepPreviousData },
  );

  const exploreQuery = trpc.admin.listExploreForms.useQuery(
    { page, pageSize: PAGE_SIZE, search: deferredSearch || undefined },
    { enabled: view === "explore", placeholderData: keepPreviousData },
  );

  const setFeaturedMutation = trpc.admin.setFeatured.useMutation();
  const deleteMutation = trpc.admin.deleteForm.useMutation();

  const active = view === "explore" ? exploreQuery : formsQuery;
  // Kept apart rather than merged so each view keeps its own column shape.
  const allForms = formsQuery.data?.forms ?? [];
  const exploreForms = exploreQuery.data?.forms ?? [];
  const total = active.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** Runs a mutation then refreshes every view that depends on it. */
  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      await Promise.all([
        utils.admin.listForms.invalidate(),
        utils.admin.listExploreForms.invalidate(),
        utils.admin.getStats.invalidate(),
        utils.public.getExploreForms.invalidate(),
      ]);
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  };

  const toggleFeatured = (id: string, currentlyFeatured: boolean) => {
    const next = !currentlyFeatured;
    void run(
      () => setFeaturedMutation.mutateAsync({ id, featured: next }),
      next ? "Marked as featured" : "Removed from featured",
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Forms</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Every form on the platform. Toggle featured to curate the Explore page.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <SearchIcon className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search forms…"
            className="h-9 w-full pl-9"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={view}
          onValueChange={(value) => {
            setView(value as "all" | "explore");
            setPage(1);
          }}
        >
          <TabsList className="h-9">
            <TabsTrigger value="all">All forms</TabsTrigger>
            <TabsTrigger value="explore">Live on Explore</TabsTrigger>
          </TabsList>
        </Tabs>

        {view === "all" ? (
          <>
            <Tabs
              value={status}
              onValueChange={(value) => {
                setStatus(value as StatusFilter);
                setPage(1);
              }}
            >
              <TabsList className="h-9">
                <TabsTrigger value="all">Any status</TabsTrigger>
                <TabsTrigger value="published">Published</TabsTrigger>
                <TabsTrigger value="draft">Draft</TabsTrigger>
                <TabsTrigger value="unpublished">Unpublished</TabsTrigger>
              </TabsList>
            </Tabs>

            <button
              type="button"
              onClick={() => {
                setFeaturedOnly((value) => !value);
                setPage(1);
              }}
              className={cn(
                "text-muted-foreground hover:bg-accent flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                featuredOnly &&
                  "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400",
              )}
            >
              <StarIcon className="size-3.5" />
              Featured only
            </button>
          </>
        ) : null}
      </div>

      {active.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : active.isError ? (
        <Empty className="py-20">
          <EmptyHeader>
            <EmptyTitle>Failed to load forms</EmptyTitle>
            <EmptyDescription>Please try again.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (view === "explore" ? exploreForms : allForms).length === 0 ? (
        <Empty className="py-20">
          <EmptyHeader>
            <EmptyTitle>No forms found</EmptyTitle>
            <EmptyDescription>Try different filters.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="bg-card overflow-hidden rounded-lg border">
            <div className="overflow-x-auto">
            {view === "explore" ? (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[50%]">Form</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Responses</TableHead>
                    <TableHead className="text-right">Featured</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exploreForms.map((form) => (
                    <TableRow key={form.id}>
                      <TableCell className="max-w-0 min-w-0">
                        <p className="truncate font-medium">{form.title}</p>
                        <Link
                          to={`/form/${form.slug}`}
                          className="text-muted-foreground hover:text-foreground block truncate text-xs underline-offset-2 hover:underline"
                        >
                          /form/{form.slug}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {form.isTemplate ? "Template" : "Form"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {form.responseCount}
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={form.isFeatured}
                          onCheckedChange={() =>
                            void toggleFeatured(form.id, form.isFeatured)
                          }
                          disabled={setFeaturedMutation.isPending}
                          aria-label={`Toggle featured for ${form.title}`}
                        />
                      </TableCell>
                      <TableCell>
                        <FormActions
                          id={form.id}
                          title={form.title}
                          onDelete={setPendingDelete}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[34%]">Form</TableHead>
                  <TableHead className="hidden md:table-cell">Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Responses</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">
                    Views
                  </TableHead>
                  <TableHead className="text-right">Featured</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {allForms.map((form) => (
                  <TableRow key={form.id}>
                    <TableCell className="max-w-0 min-w-0">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{form.title}</p>
                          <Link
                            to={`/form/${form.slug}`}
                            className="text-muted-foreground hover:text-foreground block truncate text-xs underline-offset-2 hover:underline"
                          >
                            /form/{form.slug}
                          </Link>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {form.ownerName}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {form.ownerEmail}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={form.status} />
                        <VisibilityBadge visibility={form.visibility} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {form.responseCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                      {form.viewCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={form.isFeatured}
                        onCheckedChange={() =>
                          void toggleFeatured(form.id, form.isFeatured)
                        }
                        disabled={setFeaturedMutation.isPending}
                        aria-label={`Toggle featured for ${form.title}`}
                      />
                    </TableCell>
                    <TableCell>
                      <FormActions
                        id={form.id}
                        title={form.title}
                        onDelete={setPendingDelete}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            )}
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

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Delete ${pendingDelete?.title ?? "this form"}?`}
        description="This removes the form and every response attached to it, whoever owns it. It cannot be undone."
        confirmLabel="Delete form"
        destructive
        busy={deleteMutation.isPending}
        onConfirm={() => {
          const target = pendingDelete;
          if (!target) return;
          void run(
            () => deleteMutation.mutateAsync({ id: target.id }),
            "Form deleted",
          ).finally(() => setPendingDelete(null));
        }}
      />
    </div>
  );
}

/** Row menu with the moderation actions every form row shares. */
function FormActions({
  id,
  title,
  onDelete,
}: {
  id: string;
  title: string;
  onDelete: (target: { id: string; title: string }) => void;
}) {
  const utils = trpc.useUtils();
  const unpublish = trpc.admin.unpublishForm.useMutation();

  const takeOffline = async () => {
    try {
      await unpublish.mutateAsync({ id });
      await Promise.all([
        utils.admin.listForms.invalidate(),
        utils.admin.listExploreForms.invalidate(),
        utils.admin.getStats.invalidate(),
        utils.public.getExploreForms.invalidate(),
      ]);
      toast.success(`${title} is now unpublished`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hover:bg-accent flex size-8 items-center justify-center rounded-md"
          aria-label={`Actions for ${title}`}
        >
          <MoreHorizontalIcon className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          disabled={unpublish.isPending}
          onClick={() => void takeOffline()}
        >
          <EyeOffIcon className="size-4" />
          Unpublish
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => onDelete({ id, title })}
        >
          <Trash2Icon className="size-4" />
          Delete form
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}