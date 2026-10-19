import { useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ClockIcon,
  CopyIcon,
  EyeIcon,
  HistoryIcon,
  KeyRoundIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SendIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  WEBHOOK_EVENT_ALL,
  WEBHOOK_EVENT_GROUPS,
} from "@repo/validators";

import { trpc } from "~/trpc/client";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Separator } from "~/components/ui/separator";
import { Switch } from "~/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

type DeliveryStatus = "pending" | "success" | "retrying" | "dead";

const DELIVERY_PAGE_SIZE = 15;

/** Copy the receiver has to make before a delivery will pass verification. */
const VERIFY_SNIPPET = `import { createHmac, timingSafeEqual } from "node:crypto";

// The raw request body, exactly as received — never a re-serialised object.
const raw = readRawBody(req);
const header = req.headers["x-formly-signature"]; // "t=<unix>,v1=<hex>"

const [t, v1] = String(header).split(",").map((p) => p.split("=")[1]);
if (Math.abs(Date.now() / 1000 - Number(t)) > 300) throw new Error("stale");

const expected = createHmac("sha256", process.env.FORMLY_SECRET)
  .update(\`\${t}.\${raw}\`)
  .digest("hex");

if (!timingSafeEqual(Buffer.from(v1), Buffer.from(expected))) {
  throw new Error("bad signature");
}`;

function statusMeta(status: DeliveryStatus) {
  switch (status) {
    case "success":
      return {
        label: "Delivered",
        icon: CheckCircle2Icon,
        className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      };
    case "retrying":
      return {
        label: "Retrying",
        icon: RefreshCwIcon,
        className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      };
    case "pending":
      return {
        label: "Queued",
        icon: ClockIcon,
        className: "border-muted-foreground/40 bg-muted text-muted-foreground",
      };
    default:
      return {
        label: "Failed",
        icon: XCircleIcon,
        className: "border-destructive/40 bg-destructive/10 text-destructive",
      };
  }
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.round(diff / 1000);
  if (seconds < 60) return `${Math.max(seconds, 0)}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

async function copyToClipboard(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Could not copy to clipboard");
  }
}

function JsonBlock({ value, className }: { value: string; className?: string }) {
  return (
    <pre
      className={cn(
        "max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed",
        className,
      )}
    >
      {value}
    </pre>
  );
}

// ─── Event picker ─────────────────────────────────────────

function EventPicker({
  value,
  onChange,
  idPrefix,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  idPrefix: string;
}) {
  const isAll = value.includes(WEBHOOK_EVENT_ALL);
  const selected = new Set(value);

  const toggle = (event: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(event);
    else next.delete(event);
    onChange([...next]);
  };

  return (
    <div className="flex flex-col gap-2">
      <label
        className="flex items-start gap-2 rounded-md border p-2 text-sm"
        htmlFor={`${idPrefix}-all`}
      >
        <Checkbox
          id={`${idPrefix}-all`}
          checked={isAll}
          onCheckedChange={(checked) =>
            onChange(checked ? [WEBHOOK_EVENT_ALL] : [])
          }
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">All events</span>
          <span className="text-xs text-muted-foreground">
            Receive everything below, including events added later.
          </span>
        </span>
      </label>

      <div
        className={cn(
          "flex flex-col gap-3 pl-6",
          isAll && "pointer-events-none opacity-50",
        )}
      >
        {WEBHOOK_EVENT_GROUPS.map((group) => (
          <div key={group.id} className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {group.label}
            </p>
            {group.events.map((event) => (
              <label
                key={event.value}
                className="flex items-center gap-2 text-sm"
                htmlFor={`${idPrefix}-${event.value}`}
              >
                <Checkbox
                  id={`${idPrefix}-${event.value}`}
                  checked={selected.has(event.value)}
                  onCheckedChange={(checked) =>
                    toggle(event.value, checked === true)
                  }
                />
                <span className="flex flex-col gap-0.5">
                  <span>{event.label}</span>
                  <code className="text-[11px] text-muted-foreground">
                    {event.value}
                  </code>
                </span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Payload preview ──────────────────────────────────────

function PayloadPreviewDialog({
  formId,
  open,
  onOpenChange,
}: {
  formId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [event, setEvent] = useState<string>("response.created");
  const [showVerify, setShowVerify] = useState(false);

  const preview = trpc.webhook.preview.useQuery(
    { formId, event },
    { enabled: open },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Payload preview</DialogTitle>
          <DialogDescription>
            The exact JSON this event sends. Generated from the same builders
            that run in production, so it cannot drift from a real delivery.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preview-event">Event</Label>
            <Select value={event} onValueChange={setEvent}>
              <SelectTrigger id="preview-event" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEBHOOK_EVENT_GROUPS.flatMap((group) =>
                  group.events.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  )),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">Request body</p>
            {preview.data ? (
              <JsonBlock value={JSON.stringify(preview.data.payload, null, 2)} />
            ) : (
              <p className="text-xs text-muted-foreground">Loading…</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">Headers</p>
            {preview.data ? (
              <JsonBlock
                value={JSON.stringify(preview.data.headers, null, 2)}
              />
            ) : null}
          </div>

          <Separator />

          <div className="flex flex-col gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setShowVerify((v) => !v)}
            >
              <ChevronDownIcon
                className={cn("transition-transform", showVerify && "rotate-180")}
              />
              Verifying the signature
            </Button>
            {showVerify ? (
              <JsonBlock value={VERIFY_SNIPPET} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Compare the raw{" "}
                <code className="text-[11px]">
                  HMAC-SHA256(secret, `${"{t}"}.${"{rawBody}"}`)
                </code>{" "}
                against the{" "}
                <code className="text-[11px]">v1</code> part of the{" "}
                <code className="text-[11px]">x-formly-signature</code> header,
                using a constant-time compare.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delivery log ─────────────────────────────────────────

function DeliveryRowDetail({
  delivery,
  onRedeliver,
  isRedelivering,
}: {
  delivery: {
    id: string;
    event: string;
    status: DeliveryStatus;
    requestBody: Record<string, unknown>;
    responseBody: string | null;
    responseStatus: number | null;
    error: string | null;
    durationMs: number | null;
    attempt: number;
    maxAttempts: number;
    nextRetryAt: string | null;
    isTest: boolean;
  };
  onRedeliver: () => void;
  isRedelivering: boolean;
}) {
  const [open, setOpen] = useState(false);
  const meta = statusMeta(delivery.status);
  const Icon = meta.icon;
  const settled = delivery.status === "success" || delivery.status === "dead";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
          <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
            {delivery.event}
          </Badge>
          {delivery.isTest ? (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              Test
            </Badge>
          ) : null}
          <span className="truncate text-xs text-muted-foreground">
            {delivery.error ??
              (delivery.responseStatus !== null
                ? `HTTP ${delivery.responseStatus}`
                : "Queued")}
          </span>
        </button>

        <span className="shrink-0 text-[11px] text-muted-foreground">
          {delivery.durationMs !== null ? `${delivery.durationMs}ms` : "—"}
        </span>
        <Badge variant="outline" className={cn("shrink-0", meta.className)}>
          <Icon />
          {meta.label}
        </Badge>
      </div>

      {open ? (
        <div className="flex flex-col gap-3 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              Attempt {delivery.attempt} of {delivery.maxAttempts}
            </span>
            {delivery.nextRetryAt ? (
              <span>Next retry {relativeTime(delivery.nextRetryAt)}</span>
            ) : null}
            {settled ? (
              <Button
                variant="outline"
                size="sm"
                className="h-6"
                disabled={isRedelivering}
                onClick={onRedeliver}
              >
                {isRedelivering ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <RotateCcwIcon />
                )}
                Resend
              </Button>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium">Request body</p>
            <JsonBlock value={JSON.stringify(delivery.requestBody, null, 2)} />
          </div>

          {delivery.responseBody ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium">Response body</p>
              <JsonBlock value={delivery.responseBody} />
            </div>
          ) : null}

          {delivery.error ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium">Error</p>
              <p className="rounded-md bg-destructive/10 p-2 font-mono text-[11px] text-destructive">
                {delivery.error}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DeliveryLogDialog({
  webhookId,
  open,
  onOpenChange,
}: {
  webhookId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("all");
  const [event, setEvent] = useState<string>("all");

  const query = trpc.webhook.deliveries.useQuery(
    {
      id: webhookId,
      page,
      pageSize: DELIVERY_PAGE_SIZE,
      status: status === "all" ? undefined : (status as DeliveryStatus),
      event: event === "all" ? undefined : event,
    },
    { enabled: open, placeholderData: keepPreviousData },
  );

  const redeliver = trpc.webhook.redeliver.useMutation({
    onSuccess: () => {
      toast.success("Resent");
      utils.webhook.deliveries.invalidate({ id: webhookId });
      utils.webhook.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / DELIVERY_PAGE_SIZE));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Delivery log</DialogTitle>
          <DialogDescription>
            Every attempt, with the exact payload sent and what came back.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="success">Delivered</SelectItem>
              <SelectItem value="retrying">Retrying</SelectItem>
              <SelectItem value="pending">Queued</SelectItem>
              <SelectItem value="dead">Failed</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={event}
            onValueChange={(v) => {
              setEvent(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {WEBHOOK_EVENT_GROUPS.flatMap((group) =>
                group.events.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                )),
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {query.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Loading deliveries…
            </p>
          ) : query.data?.deliveries.length ? (
            <div className="flex flex-col gap-3">
              {query.data.deliveries.map((delivery) => (
                <DeliveryRowDetail
                  key={delivery.id}
                  delivery={delivery}
                  isRedelivering={redeliver.isPending}
                  onRedeliver={() =>
                    redeliver.mutate({
                      deliveryId: delivery.id,
                      webhookId,
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No deliveries yet. Use Test to send a sample payload.
            </p>
          )}
        </div>

        {pageCount > 1 ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {page} of {pageCount} · {total} total
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─── Secret dialog ────────────────────────────────────────

function SecretDialog({
  secret,
  open,
  onOpenChange,
  rotatedAt,
}: {
  secret: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rotatedAt?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Signing secret</DialogTitle>
          <DialogDescription>
            Copy this now. It is shown once and is not listed anywhere else in
            the app — if you lose it, rotate to get a new one.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-md border p-2">
          <code className="min-w-0 flex-1 break-all text-xs">{secret}</code>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => copyToClipboard(secret, "Secret")}
            aria-label="Copy secret"
          >
            <CopyIcon />
          </Button>
        </div>

        {rotatedAt ? (
          <p className="text-xs text-muted-foreground">
            Last rotated {new Date(rotatedAt).toLocaleString()}.
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Requests are signed as{" "}
          <code className="text-[11px]">
            HMAC-SHA256(secret, `${"{timestamp}"}.${"{body}"}`)
          </code>{" "}
          and sent in the{" "}
          <code className="text-[11px]">x-formly-signature</code> header.
          Rotating invalidates the old secret immediately, so update your
          receiver before rotating in production.
        </p>
      </DialogContent>
    </Dialog>
  );
}

// ─── Webhook card ─────────────────────────────────────────

function WebhookCard({
  hook,
  formId,
  onSecret,
}: {
  hook: {
    id: string;
    url: string;
    events: string[];
    active: boolean;
    hasSecret: boolean;
    secretPreview: string | null;
    secretRotatedAt: string | null;
    lastStatus: number | null;
    lastError: string | null;
    lastTriggeredAt: string | null;
    consecutiveFailures: number;
    autoDisabledAt: string | null;
    autoDisabledReason: string | null;
    deliveryCounts: Record<string, number>;
  };
  formId: string;
  onSecret: (secret: string, rotatedAt?: string | null) => void;
}) {
  const utils = trpc.useUtils();
  const [logOpen, setLogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testEvent, setTestEvent] = useState<string>("response.created");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const invalidate = () => {
    utils.webhook.list.invalidate({ formId });
    utils.webhook.deliveries.invalidate({ id: hook.id });
  };

  const updateHook = trpc.webhook.update.useMutation({
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });

  const testHook = trpc.webhook.test.useMutation({
    onSuccess: (result) => {
      invalidate();
      if (result.ok) {
        toast.success(`Delivered in ${result.durationMs ?? 0}ms (HTTP ${result.status})`);
      } else {
        toast.error(result.error ?? `Failed with HTTP ${result.status}`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteHook = trpc.webhook.delete.useMutation({
    onSuccess: () => {
      setConfirmDelete(false);
      invalidate();
      toast.success("Webhook deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const rotate = trpc.webhook.rotateSecret.useMutation({
    onSuccess: (result) => {
      invalidate();
      onSecret(result.secret, result.secretRotatedAt);
    },
    onError: (err) => toast.error(err.message),
  });

  const reveal = trpc.webhook.revealSecret.useQuery(
    { id: hook.id },
    { enabled: false },
  );

  const dead = hook.deliveryCounts.dead ?? 0;
  const success = hook.deliveryCounts.success ?? 0;
  const queued = (hook.deliveryCounts.pending ?? 0) + (hook.deliveryCounts.retrying ?? 0);

  const subscribed = hook.events.includes(WEBHOOK_EVENT_ALL);

  return (
    <>
      <div className="flex flex-col gap-2 rounded-md border p-3">
        {hook.autoDisabledAt ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {hook.autoDisabledReason} Re-enable it from the switch above once
              your endpoint is healthy.
            </p>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate text-xs">{hook.url}</code>
          <Switch
            checked={hook.active}
            onCheckedChange={(checked) =>
              updateHook.mutate({ id: hook.id, active: checked })
            }
            aria-label="Toggle webhook"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete webhook"
          >
            <Trash2Icon />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {subscribed ? (
            <Badge variant="secondary" className="text-[10px]">
              All events
            </Badge>
          ) : (
            hook.events.map((name) => (
              <Badge key={name} variant="outline" className="font-mono text-[10px]">
                {name}
              </Badge>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2Icon className="size-3" />
            {success} delivered
          </span>
          {dead > 0 ? (
            <span className="inline-flex items-center gap-1 text-destructive">
              <XCircleIcon className="size-3" />
              {dead} failed
            </span>
          ) : null}
          {queued > 0 ? (
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="size-3" />
              {queued} queued
            </span>
          ) : null}
          {hook.lastTriggeredAt ? (
            <span>
              Last attempt{" "}
              {relativeTime(hook.lastTriggeredAt)}
              {hook.lastStatus !== null ? ` · HTTP ${hook.lastStatus}` : ""}
            </span>
          ) : (
            <span>Awaiting first delivery</span>
          )}
        </div>

        {hook.lastError ? (
          <p className="truncate text-[11px] text-destructive" title={hook.lastError}>
            {hook.lastError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Select value={testEvent} onValueChange={setTestEvent}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEBHOOK_EVENT_GROUPS.flatMap((group) =>
                group.events.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                )),
              )}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            disabled={testHook.isPending || !hook.active}
            onClick={() => testHook.mutate({ id: hook.id, event: testEvent })}
          >
            {testHook.isPending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <SendIcon />
            )}
            Test
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setLogOpen(true)}
          >
            <HistoryIcon />
            Log
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewOpen(true)}
          >
            Payload
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-2">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <KeyRoundIcon className="size-3" />
            {hook.hasSecret ? hook.secretPreview : "No secret"}
            {hook.secretRotatedAt ? (
              <span className="text-[11px]">
                · rotated {relativeTime(hook.secretRotatedAt)}
              </span>
            ) : null}
          </span>
          <div className="ml-auto flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    reveal
                      .refetch()
                      .then((res) =>
                        res.data?.secret
                          ? onSecret(res.data.secret, hook.secretRotatedAt)
                          : toast.error("This webhook has no secret"),
                      )
                  }
                >
                  <EyeIcon />
                  Reveal
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Show the current signing secret
              </TooltipContent>
            </Tooltip>

            <Button
              variant="ghost"
              size="sm"
              disabled={rotate.isPending}
              onClick={() => rotate.mutate({ id: hook.id })}
            >
              <RotateCcwIcon />
              Rotate
            </Button>
          </div>
        </div>
      </div>

      <DeliveryLogDialog
        webhookId={hook.id}
        open={logOpen}
        onOpenChange={setLogOpen}
      />
      <PayloadPreviewDialog
        formId={formId}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this webhook?"
        description="The endpoint stops receiving events and its delivery history is deleted. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteHook.mutate({ id: hook.id })}
      />
    </>
  );
}

// ─── Panel ────────────────────────────────────────────────

export function WebhooksSettings({ formId }: { formId: string }) {
  const utils = trpc.useUtils();
  const hooks = trpc.webhook.list.useQuery({ formId });

  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["response.created"]);
  const [error, setError] = useState<string | null>(null);
  const [pendingSecret, setPendingSecret] = useState<string | null>(null);
  const [secretRotatedAt, setSecretRotatedAt] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const createHook = trpc.webhook.create.useMutation({
    onSuccess: (result) => {
      utils.webhook.list.invalidate({ formId });
      setUrl("");
      setEvents(["response.created"]);
      // A freshly created hook has never been rotated; clear any timestamp left
      // over from a previous reveal/rotate dialog.
      setSecretRotatedAt(null);
      setPendingSecret(result.secret);
      toast.success("Webhook added");
    },
    onError: (err) => setError(err.message),
  });

  const hasHooks = (hooks.data?.length ?? 0) > 0;

  const summary = useMemo(() => {
    if (!hooks.data) return null;
    const totals = hooks.data.reduce(
      (acc, hook) => {
        acc.success += hook.deliveryCounts.success ?? 0;
        acc.dead += hook.deliveryCounts.dead ?? 0;
        return acc;
      },
      { success: 0, dead: 0 },
    );
    return totals;
  }, [hooks.data]);

  const submit = () => {
    if (!url.trim()) {
      setError("Enter a webhook URL.");
      return;
    }
    if (events.length === 0) {
      setError("Pick at least one event.");
      return;
    }
    setError(null);
    createHook.mutate({ formId, url: url.trim(), events });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Webhooks</p>
          <p className="text-xs text-muted-foreground">
            POST a signed JSON payload to your own endpoint on the events you
            choose. Failed deliveries retry automatically with backoff.
          </p>
        </div>
        {hasHooks ? (
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <KeyRoundIcon />
            Payload
          </Button>
        ) : null}
      </div>

      {summary && (summary.success > 0 || summary.dead > 0) ? (
        <p className="text-xs text-muted-foreground">
          {summary.success} delivered
          {summary.dead > 0 ? ` · ${summary.dead} failed` : ""} so far.
        </p>
      ) : null}

      {hasHooks ? (
        <div className="flex flex-col gap-2">
          {hooks.data!.map((hook) => (
            <WebhookCard
              key={hook.id}
              hook={hook}
              formId={formId}
              onSecret={(secret, rotatedAt) => {
                setPendingSecret(secret);
                setSecretRotatedAt(rotatedAt ?? null);
              }}
            />
          ))}
        </div>
      ) : (
        !hooks.isLoading && (
          <p className="text-xs text-muted-foreground">
            No webhooks yet. Add one below.
          </p>
        )
      )}

      <div className="flex flex-col gap-3 rounded-md border p-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="webhook-url">Endpoint URL</Label>
          <Input
            id="webhook-url"
            type="url"
            placeholder="https://your-app.com/hooks/formly"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Must be a public HTTPS URL. A signing secret is generated for you.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Events</Label>
          <EventPicker
            value={events}
            onChange={setEvents}
            idPrefix="webhook-create"
          />
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <Button
          size="sm"
          type="button"
          disabled={createHook.isPending}
          onClick={submit}
          className="self-start"
        >
          <PlusIcon /> Add webhook
        </Button>
      </div>

      <SecretDialog
        secret={pendingSecret ?? ""}
        open={pendingSecret !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSecret(null);
        }}
        rotatedAt={secretRotatedAt}
      />

      <PayloadPreviewDialog
        formId={formId}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </div>
  );
}
