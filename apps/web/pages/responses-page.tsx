import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  InboxIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { trpc } from "~/trpc/client";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

type AnswerValueObject = {
  fileId?: string;
  name?: string;
  url?: string;
  size?: number;
  mimeType?: string;
  paymentId?: string;
  orderId?: string;
  amount?: number;
  currency?: string;
  status?: string;
};

type ResponseRow = {
  id: string;
  submittedAt: string;
  completedInSeconds?: number | null;
  answers: {
    fieldId: string;
    fieldLabel: string;
    value: string | number | boolean | string[] | AnswerValueObject | null;
  }[];
};

export function ResponsesPage() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const [page, setPage] = useState(1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const pageSize = 10;

  const formQuery = trpc.form.getById.useQuery(
    { id: formId ?? "" },
    { enabled: !!formId },
  );

  const responsesQuery = trpc.response.list.useQuery(
    {
      formId: formId ?? "",
      page,
      pageSize,
      ...(from ? { from: `${from}T00:00:00` } : {}),
      ...(to ? { to: `${to}T23:59:59.999` } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    },
    { enabled: !!formId, placeholderData: keepPreviousData },
  );

  const exportCsv = trpc.response.exportCsv.useQuery(
    { formId: formId ?? "" },
    { enabled: false },
  );
  const deleteMutation = trpc.response.delete.useMutation();

  const [selected, setSelected] = useState<ResponseRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResponseRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const responses: ResponseRow[] = responsesQuery.data?.responses ?? [];
  const total = responsesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const title = formQuery.data?.form.title;

  const handleExport = async () => {
    if (!formId) return;
    setExporting(true);
    try {
      const result = await exportCsv.refetch();
      if (!result.data) {
        toast.error("Export failed");
        return;
      }
      const blob = new Blob([result.data.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.data.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Responses exported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteTarget.id });
      await utils.response.list.invalidate();
      toast.success("Response deleted");
      if (selected?.id === deleteTarget.id) setSelected(null);
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground"
            onClick={() => navigate("/dashboard")}
          >
            <ArrowLeftIcon />
            Back to forms
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {title ?? "Responses"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {responsesQuery.isLoading
              ? "Loading responses\u2026"
              : `${total} response${total === 1 ? "" : "s"}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              aria-label="Search answers"
              placeholder="Search answers\u2026"
              className="h-9 w-56 pl-8"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Input
            type="date"
            aria-label="From date"
            className="h-9 w-36"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <Input
            type="date"
            aria-label="To date"
            className="h-9 w-36"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
          <Button variant="outline" onClick={() => void handleExport()} disabled={exporting || total === 0}>
            <DownloadIcon />
            Export CSV
          </Button>
        </div>
      </div>

      <Separator />

      {responsesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : responsesQuery.isError ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Failed to load responses</EmptyTitle>
            <EmptyDescription>
              Couldn&apos;t fetch responses for this form. Please try again.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => void responsesQuery.refetch()}>
              Retry
            </Button>
          </EmptyContent>
        </Empty>
      ) : responses.length === 0 ? (
        <Empty className="py-20">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>No responses yet</EmptyTitle>
            <EmptyDescription>
              {search.trim() || from || to
                ? "No responses match the current filters."
                : "Published submissions for this form will appear here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="bg-card overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Submitted</TableHead>
                <TableHead>Time taken</TableHead>
                <TableHead className="text-right">Answers</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {responses.map((response) => (
                <TableRow
                  key={response.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(response)}
                >
                  <TableCell className="tabular-nums">
                    {formatDateTime(response.submittedAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm tabular-nums">
                    {formatDuration(response.completedInSeconds)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary">{response.answers.length}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="View response"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(response);
                        }}
                      >
                        <InboxIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete response"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(response);
                        }}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-muted-foreground text-sm tabular-nums">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeftIcon />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                  <ChevronRightIcon />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Response details</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-muted-foreground">
                  Submitted {formatDateTime(selected.submittedAt)}
                </span>
                {selected.completedInSeconds != null && (
                  <span className="text-muted-foreground">
                    Took {formatDuration(selected.completedInSeconds)}
                  </span>
                )}
              </div>
              <Separator />
              <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
                {selected.answers.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    This response has no answers.
                  </p>
                ) : (
                  selected.answers.map((answer) => (
                    <div key={answer.fieldId}>
                      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                        {answer.fieldLabel}
                      </p>
<p className="mt-0.5 text-sm whitespace-pre-wrap">
                      {typeof answer.value === "object" &&
                      answer.value !== null &&
                      !Array.isArray(answer.value) ? (
                        answer.value.url ? (
                          <a
                            href={answer.value.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-primary underline underline-offset-2"
                          >
                            {answer.value.name ?? "Download file"}
                          </a>
                        ) : "amount" in answer.value &&
                          typeof answer.value.amount === "number" &&
                          typeof answer.value.currency === "string" ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="font-medium">
                              Paid {answer.value.currency} {answer.value.amount}
                            </span>
                            <span
                              className={
                                "rounded-full px-2 py-0.5 text-xs font-medium " +
                                (answer.value.status === "refunded"
                                  ? "bg-amber-500/15 text-amber-400"
                                  : "bg-emerald-500/15 text-emerald-400")
                              }
                            >
                              {answer.value.status ?? "paid"}
                            </span>
                          </span>
                        ) : (
                          answer.value.name ?? "File"
                        )
                      ) : (
                        formatAnswerValue(answer.value)
                      )}
                    </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this response?"
        description="This response and its answers will be permanently removed. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        busy={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

function formatAnswerValue(
  value: string | number | boolean | string[] | AnswerValueObject | null,
): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "\u2014";
  if (
    typeof value === "object" &&
    "amount" in value &&
    typeof value.amount === "number" &&
    typeof value.currency === "string"
  ) {
    return `Paid ${value.currency} ${value.amount}`;
  }
  if (typeof value === "object") return value.name ?? value.url ?? "File";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds?: number | null): string {
  if (seconds == null) return "\u2014";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}