import { useDeferredValue, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { SearchIcon, StarIcon } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "~/trpc/client";
import { StatusBadge, VisibilityBadge } from "~/components/dashboard/form-status-badge";
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

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [status, setStatus] = useState<StatusFilter>("all");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [page, setPage] = useState(1);

  const formsQuery = trpc.admin.listForms.useQuery(
    {
      page,
      pageSize: PAGE_SIZE,
      search: deferredSearch || undefined,
      status: status === "all" ? undefined : status,
      featured: featuredOnly || undefined,
    },
    { placeholderData: keepPreviousData },
  );

  const setFeaturedMutation = trpc.admin.setFeatured.useMutation();

  const forms = formsQuery.data?.forms ?? [];
  const total = formsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleFeatured = async (id: string, currentlyFeatured: boolean) => {
    const next = !currentlyFeatured;
    try {
      await setFeaturedMutation.mutateAsync({ id, featured: next });
      await Promise.all([
        utils.admin.listForms.invalidate(),
        utils.admin.getStats.invalidate(),
        utils.public.getExploreForms.invalidate(),
      ]);
      toast.success(next ? "Marked as featured" : "Removed from featured");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
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
        <div className="relative">
          <SearchIcon className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search forms…"
            className="h-9 w-64 pl-9"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={status}
          onValueChange={(value) => {
            setStatus(value as StatusFilter);
            setPage(1);
          }}
        >
          <TabsList className="h-9">
            <TabsTrigger value="all">All</TabsTrigger>
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
      </div>

      {formsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : formsQuery.isError ? (
        <Empty className="py-20">
          <EmptyHeader>
            <EmptyTitle>Failed to load forms</EmptyTitle>
            <EmptyDescription>Please try again.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : forms.length === 0 ? (
        <Empty className="py-20">
          <EmptyHeader>
            <EmptyTitle>No forms found</EmptyTitle>
            <EmptyDescription>Try different filters.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="bg-card overflow-hidden rounded-lg border">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {forms.map((form) => (
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
    </div>
  );
}