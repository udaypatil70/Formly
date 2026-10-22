import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import {
  ActivityIcon,
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  InboxIcon,
  PencilIcon,
  SearchIcon,
  StarIcon,
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
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Textarea } from "~/components/ui/textarea";

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

type ResponseAnswer = {
  fieldId: string;
  fieldLabel: string;
  value: string | number | boolean | string[] | AnswerValueObject | null;
};

type ResponseRow = {
  id: string;
  submittedAt: string;
  completedInSeconds?: number | null;
  editedAt?: string | null;
  notes?: string | null;
  tags?: string[];
  starred?: boolean;
  answers: ResponseAnswer[];
};

type ResponseField = {
  id: string;
  type: string;
  label: string;
  options?: { value: string; label: string }[];
};

const IMMUTABLE_TYPES = new Set(["file_upload", "payment", "page_break"]);

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
    { enabled: !!formId, placeholderData: keepPreviousData, refetchInterval: 10_000 },
  );

  const exportCsv = trpc.response.exportCsv.useQuery(
    { formId: formId ?? "" },
    { enabled: false },
  );
  const deleteMutation = trpc.response.delete.useMutation();
  const updateMutation = trpc.response.update.useMutation();

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

  const handleToggleStar = async (response: ResponseRow) => {
    try {
      const updated = await updateMutation.mutateAsync({
        id: response.id,
        starred: !response.starred,
      });
      setSelected((prev) =>
        prev?.id === response.id ? (updated as ResponseRow) : prev,
      );
      await utils.response.list.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    }
  };

  const handleResponseUpdated = (updated: ResponseRow) => {
    setSelected(updated);
    void utils.response.list.invalidate();
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
          <div className="flex items-center gap-2">
            <p className="text-muted-foreground text-sm">
              {responsesQuery.isLoading
                ? "Loading responses\u2026"
                : `${total} response${total === 1 ? "" : "s"}`}
            </p>
            <Badge
              variant="outline"
              className="gap-1.5 border-emerald-500/30 text-emerald-500"
            >
              <ActivityIcon className="size-3 animate-pulse" />
              Live
            </Badge>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:w-auto">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              aria-label="Search answers"
              placeholder="Search answers\u2026"
              className="h-9 w-full pl-8 sm:w-56"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Input
            type="date"
            aria-label="From date"
            className="h-9 w-full"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <Input
            type="date"
            aria-label="To date"
            className="h-9 w-full"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
          </div>
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => void handleExport()}
            disabled={exporting || total === 0}
          >
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
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <span className="sr-only">Starred</span>
                </TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="hidden sm:table-cell">Time taken</TableHead>
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
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={
                        response.starred ? "Unstar response" : "Star response"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleToggleStar(response);
                      }}
                    >
                      <StarIcon
                        className={
                          response.starred
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground"
                        }
                      />
                    </Button>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDateTime(response.submittedAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-sm tabular-nums sm:table-cell">
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
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col items-center justify-between gap-2 border-t px-4 py-3 sm:flex-row">
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
            <ResponseDetail
              key={selected.id}
              response={selected}
              fields={formQuery.data?.fields ?? []}
              onUpdated={handleResponseUpdated}
              onDelete={() => setDeleteTarget(selected)}
            />
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

function ResponseDetail({
  response,
  fields,
  onUpdated,
  onDelete,
}: {
  response: ResponseRow;
  fields: ResponseField[];
  onUpdated: (response: ResponseRow) => void;
  onDelete: () => void;
}) {
  const utils = trpc.useUtils();
  const update = trpc.response.update.useMutation();
  const [notes, setNotes] = useState(response.notes ?? "");
  const [tagsText, setTagsText] = useState((response.tags ?? []).join(", "));
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [draft, setDraft] = useState<unknown>("");

  const fieldById = new Map(fields.map((field) => [field.id, field]));

  const invalidate = () => {
    void utils.response.list.invalidate();
  };

  const saveMetadata = async () => {
    try {
      const tags = [
        ...new Set(
          tagsText
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ];
      const updated = await update.mutateAsync({
        id: response.id,
        notes: notes.trim() ? notes : null,
        tags,
        starred: response.starred ?? false,
      });
      onUpdated(updated as ResponseRow);
      invalidate();
      toast.success("Response details saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    }
  };

  const toggleStar = async () => {
    try {
      const updated = await update.mutateAsync({
        id: response.id,
        starred: !(response.starred ?? false),
      });
      onUpdated(updated as ResponseRow);
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    }
  };

  const startEditing = (answer: ResponseAnswer) => {
    setEditingFieldId(answer.fieldId);
    setDraft(
      Array.isArray(answer.value) ? [...answer.value] : (answer.value ?? ""),
    );
  };

  const saveAnswer = async (field: ResponseField) => {
    try {
      const value = coerceAnswerValue(field, draft);
      const updated = await update.mutateAsync({
        id: response.id,
        answers: { [field.id]: value },
      });
      onUpdated(updated as ResponseRow);
      invalidate();
      setEditingFieldId(null);
      toast.success("Answer updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="text-muted-foreground">
            Submitted {formatDateTime(response.submittedAt)}
          </span>
          {response.completedInSeconds != null && (
            <span className="text-muted-foreground">
              Took {formatDuration(response.completedInSeconds)}
            </span>
          )}
          {response.editedAt ? (
            <span className="text-muted-foreground">
              Edited {formatDateTime(response.editedAt)}
            </span>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void toggleStar()}
          disabled={update.isPending}
        >
          <StarIcon
            className={
              response.starred
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground"
            }
          />
          {response.starred ? "Starred" : "Star"}
        </Button>
      </div>

      <Separator />

      <div className="flex max-h-80 flex-col gap-4 overflow-y-auto pr-1">
        {response.answers.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            This response has no answers.
          </p>
        ) : (
          response.answers.map((answer) => {
            const field = fieldById.get(answer.fieldId);
            const canEdit = Boolean(field && !IMMUTABLE_TYPES.has(field.type));
            const editing = editingFieldId === answer.fieldId && field;
            return (
              <div key={answer.fieldId} className="flex flex-col gap-1">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  {answer.fieldLabel}
                </p>
                {editing ? (
                  <div className="flex flex-col gap-2">
                    <AnswerEditor
                      field={field}
                      value={draft}
                      onChange={setDraft}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingFieldId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={update.isPending}
                        onClick={() => void saveAnswer(field)}
                      >
                        Save answer
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 text-sm whitespace-pre-wrap">
                      <AnswerValueDisplay value={answer.value} />
                    </div>
                    {canEdit ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${answer.fieldLabel}`}
                        onClick={() => startEditing(answer)}
                      >
                        <PencilIcon />
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="response-notes">Private notes</Label>
          <Textarea
            id="response-notes"
            rows={3}
            maxLength={10_000}
            value={notes}
            placeholder="Notes only your team can see"
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="response-tags">Tags</Label>
          <Input
            id="response-tags"
            value={tagsText}
            placeholder="vip, follow-up, beta"
            onChange={(e) => setTagsText(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Separate tags with commas.
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={onDelete}
          >
            <Trash2Icon />
            Delete response
          </Button>
          <Button
            size="sm"
            disabled={update.isPending}
            onClick={() => void saveMetadata()}
          >
            Save details
          </Button>
        </div>
      </div>
    </div>
  );
}

function AnswerValueDisplay({ value }: { value: ResponseAnswer["value"] }) {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    if (safeAnswerUrl(value.url)) {
      return (
        <a
          href={safeAnswerUrl(value.url)}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary underline underline-offset-2"
        >
          {value.name ?? "Download file"}
        </a>
      );
    }
    if (
      "amount" in value &&
      typeof value.amount === "number" &&
      typeof value.currency === "string"
    ) {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium">
            Paid {value.currency} {value.amount}
          </span>
          <span
            className={
              "rounded-full px-2 py-0.5 text-xs font-medium " +
              (value.status === "refunded"
                ? "bg-amber-500/15 text-amber-400"
                : "bg-emerald-500/15 text-emerald-400")
            }
          >
            {value.status ?? "paid"}
          </span>
        </span>
      );
    }
    return <>{value.name ?? "File"}</>;
  }
  return <>{formatAnswerValue(value)}</>;
}

function AnswerEditor({
  field,
  value,
  onChange,
}: {
  field: ResponseField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === "long_text") {
    return (
      <Textarea
        rows={3}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (
    (field.type === "single_select" || field.type === "radio") &&
    field.options &&
    field.options.length > 0
  ) {
    return (
      <select
        className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Select an option</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (
    (field.type === "multi_select" || field.type === "checkbox") &&
    field.options &&
    field.options.length > 0
  ) {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="flex flex-col gap-2 rounded-md border p-3">
        {field.options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label
              key={option.value}
              className="flex items-center justify-between gap-3 text-sm"
            >
              {option.label}
              <Switch
                checked={checked}
                onCheckedChange={(next) =>
                  onChange(
                    next
                      ? [...selected, option.value]
                      : selected.filter((item) => item !== option.value),
                  )
                }
              />
            </label>
          );
        })}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Switch
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked)}
        />
        <span>{value === true ? "Checked" : "Unchecked"}</span>
      </div>
    );
  }

  const inputType =
    field.type === "number" ||
    field.type === "rating" ||
    field.type === "scale"
      ? "number"
      : field.type === "date"
        ? "date"
        : field.type === "time"
          ? "time"
          : field.type === "email"
            ? "email"
            : field.type === "url"
              ? "url"
              : field.type === "phone"
                ? "tel"
                : "text";

  const rawValue =
    typeof value === "string" || typeof value === "number" ? value : "";
  const inputValue =
    field.type === "date"
      ? String(rawValue).slice(0, 10)
      : field.type === "time"
        ? String(rawValue).slice(0, 5)
        : rawValue;

  return (
    <Input
      type={inputType}
      value={inputValue}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function coerceAnswerValue(field: ResponseField, value: unknown): unknown {
  if (
    field.type === "number" ||
    field.type === "rating" ||
    field.type === "scale"
  ) {
    if (value === "" || value == null) return null;
    return Number(value);
  }
  if (field.type === "checkbox") return value === true;
  if (field.type === "multi_select") {
    return Array.isArray(value) ? value : [];
  }
  if (value === "") return null;
  return value;
}

/**
 * Only http(s) links are rendered as anchors. A respondent controls the file
 * answer payload, so a `javascript:` URL must never reach an href.
 */
function safeAnswerUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\s*(?:javascript|data|vbscript|blob|file):/i.test(trimmed)) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
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