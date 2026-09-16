import { useDeferredValue, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import {
  ArchiveIcon,
  ArrowLeftRightIcon,
  ClipboardCopyIcon,
  EyeIcon,
  FilePlus2Icon,
  InboxIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  RotateCcwIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { trpc } from "~/trpc/client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/components/ui/empty";
import { Skeleton } from "~/components/ui/skeleton";
import { StatusBadge, VisibilityBadge } from "./form-status-badge";

export function MyFormsDashboard() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [deleteForm, setDeleteForm] = useState<
    { id: string; title: string } | null
  >(null);

  const formsQuery = trpc.form.getAllMine.useQuery(
    { page: 1, pageSize: 100, includeArchived },
    { placeholderData: keepPreviousData },
  );

  const publishMutation = trpc.form.publish.useMutation();
  const unpublishMutation = trpc.form.unpublish.useMutation();
  const cloneMutation = trpc.form.clone.useMutation();
  const archiveMutation = trpc.form.archive.useMutation();
  const restoreMutation = trpc.form.restore.useMutation();
  const deleteMutation = trpc.form.delete.useMutation();

  const forms = (formsQuery.data?.forms ?? []).filter((form) =>
    deferredSearch
      ? form.title.toLowerCase().includes(deferredSearch) ||
        (form.description ?? "").toLowerCase().includes(deferredSearch)
      : true,
  );

  const run = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      await utils.form.getAllMine.invalidate();
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  };

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/f/${slug}`;
    void navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  const isBusy = publishMutation.isPending || unpublishMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {includeArchived ? "Archived forms" : "My forms"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Create, publish and manage your forms.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Tabs
            value={includeArchived ? "archived" : "active"}
            onValueChange={(value) => setIncludeArchived(value === "archived")}
          >
            <TabsList className="h-9">
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative hidden sm:block">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search formsâ€¦"
              className="h-9 w-56"
            />
          </div>
          <Button onClick={() => navigate("/builder")}>
            <FilePlus2Icon />
            New form
          </Button>
        </div>
      </div>

      {formsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : formsQuery.isError ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Failed to load forms</EmptyTitle>
            <EmptyDescription>
              Couldn&apos;t fetch your forms. Please try again.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => void formsQuery.refetch()}>
              Retry
            </Button>
          </EmptyContent>
        </Empty>
      ) : forms.length === 0 ? (
        <Empty className="py-20">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FilePlus2Icon />
            </EmptyMedia>
            <EmptyTitle>
              {deferredSearch
                ? "No matching forms"
                : includeArchived
                  ? "Nothing archived yet"
                  : "You haven't created any forms"}
            </EmptyTitle>
            <EmptyDescription>
              {deferredSearch
                ? "Try a different search term."
                : includeArchived
                  ? "Archived forms will show up here."
                  : "Create your first form and start collecting responses."}
            </EmptyDescription>
          </EmptyHeader>
          {!deferredSearch && !includeArchived && (
            <EmptyContent>
              <Button onClick={() => navigate("/builder")}>
                <FilePlus2Icon />
                Create your first form
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="bg-card overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[42%]">Form</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Responses</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Updated</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.map((form) => (
                <TableRow key={form.id} className="group">
                  <TableCell className="max-w-0 min-w-0">
                    <button
                      className="flex w-full cursor-pointer items-start gap-2 text-left"
                      onClick={() => navigate(`/builder/${form.id}`)}
                    >
                      <div className={archivedIconStyles(form.archived)}>
                        <ArrowLeftRightIcon className="size-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{form.title}</div>
                        <div className="text-muted-foreground truncate text-xs">
                          /f/{form.slug}
                        </div>
                      </div>
                    </button>
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
                  <TableCell className="text-right tabular-nums">
                    {form.viewCount}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                    {formatDate(form.updatedAt ?? form.createdAt)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="data-[state=open]:bg-accent"
                          aria-label="Form actions"
                        >
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-52"
                      >
                        <DropdownMenuItem onClick={() => navigate(`/builder/${form.id}`)}>
                          <PencilIcon />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/responses/${form.id}`)}>
                          <InboxIcon />
                          View responses
                        </DropdownMenuItem>
                        {form.status === "published" ? (
                          <DropdownMenuItem
                            disabled={isBusy}
                            onClick={() =>
                              void run(
                                () => unpublishMutation.mutateAsync({ id: form.id }),
                                "Form unpublished",
                              )
                            }
                          >
                            <SquareIcon />
                            Unpublish
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            disabled={isBusy}
                            onClick={() =>
                              void run(
                                () => publishMutation.mutateAsync({ id: form.id }),
                                "Form published",
                              )
                            }
                          >
                            <PlayIcon />
                            Publish
                          </DropdownMenuItem>
                        )}
                        {form.status === "published" && (
                          <DropdownMenuItem onClick={() => navigate(`/f/${form.slug}`)}>
                            <EyeIcon />
                            View live
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => copyLink(form.slug)}>
                          <ClipboardCopyIcon />
                          Copy link
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            void run(
                              () => cloneMutation.mutateAsync({ id: form.id }),
                              "Form duplicated",
                            )
                          }
                        >
                          <ArrowLeftRightIcon />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {form.archived ? (
                          <DropdownMenuItem
                            onClick={() =>
                              void run(
                                () => restoreMutation.mutateAsync({ id: form.id }),
                                "Form restored",
                              )
                            }
                          >
                            <RotateCcwIcon />
                            Restore
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() =>
                              void run(
                                () => archiveMutation.mutateAsync({ id: form.id }),
                                "Form archived",
                              )
                            }
                          >
                            <ArchiveIcon />
                            Archive
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleteForm({ id: form.id, title: form.title })}
                        >
                          <Trash2Icon />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog
        open={deleteForm !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteForm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this form?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteForm?.title}&rdquo; and all of its responses will be
              permanently removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!deleteForm) return;
                void run(
                  () => deleteMutation.mutateAsync({ id: deleteForm.id }),
                  "Form deleted",
                ).then(() => setDeleteForm(null));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function archivedIconStyles(archived: boolean): string {
  return archived
    ? "text-muted-foreground/50 flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted"
    : "text-primary flex size-8 shrink-0 items-center justify-center rounded-md border bg-primary/10";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "â€”";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}