import { useEffect, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CreditCardIcon,
  RefreshCwIcon,
  SearchIcon,
  Undo2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { currencyMinorUnitFactor, fromMinorUnits, toMinorUnits } from "@repo/validators";
import type { RouterOutputs } from "@repo/api/client";

import { trpc } from "~/trpc/client";
import { formatMinorAmount } from "~/lib/money";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
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
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

type PaymentRow = RouterOutputs["payment"]["list"]["payments"][number];
type PaymentStatus = PaymentRow["status"];
type StatusFilter = "all" | PaymentStatus;

const STATUS_LABELS: Record<PaymentStatus, string> = {
  created: "Pending",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
};

const STATUS_STYLES: Record<PaymentStatus, string> = {
  created: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  refunded: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

/** Status pill for a ledger row. */
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge variant="outline" className={STATUS_STYLES[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function LedgerStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-[5.5rem]">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

function remainingRefundable(payment: PaymentRow): number {
  return Math.max(0, payment.amountPaise - payment.refundedAmountPaise);
}

function paymentTotalLabel(payment: PaymentRow): string {
  if (payment.refundedAmountPaise > 0 && payment.status === "paid") {
    return `${formatMinorAmount(payment.refundedAmountPaise, payment.currency)} refunded`;
  }
  return formatMinorAmount(payment.amountPaise, payment.currency);
}

function RefundDialog({
  payment,
  onClose,
}: {
  payment: PaymentRow | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const refundMutation = trpc.payment.refund.useMutation();
  const [amount, setAmount] = useState("");

  const currency = payment?.currency ?? "INR";
  const remaining = payment ? remainingRefundable(payment) : 0;
  const factor = currencyMinorUnitFactor(currency);
  const step = 1 / factor;

  const open = payment !== null;

  useEffect(() => {
    if (!payment) {
      setAmount("");
      return;
    }
    setAmount(String(fromMinorUnits(remainingRefundable(payment), payment.currency)));
  }, [payment]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setAmount("");
      onClose();
    }
  };

  const handleSubmit = async () => {
    if (!payment) return;

    const amountMajor = Number(amount);
    if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
      toast.error("Enter a refund amount greater than zero");
      return;
    }
    const amountPaise = toMinorUnits(amountMajor, currency);
    if (amountPaise > remaining) {
      toast.error("Refund amount exceeds the remaining balance");
      return;
    }

    try {
      await refundMutation.mutateAsync({
        id: payment.id,
        ...(amountPaise < remaining ? { amountPaise } : {}),
      });
      await utils.payment.list.invalidate();
      toast.success("Refund submitted to Razorpay");
      setAmount("");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refund failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Refund payment</DialogTitle>
          <DialogDescription>
            Refunds are sent to Razorpay immediately. Partial refunds leave the
            payment open for the remaining balance.
          </DialogDescription>
        </DialogHeader>

        {payment ? (
          <div className="flex flex-col gap-4">
            <div className="bg-muted/50 grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Payment</p>
                <p className="font-medium tabular-nums">
                  {formatMinorAmount(payment.amountPaise, currency)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Remaining</p>
                <p className="font-medium tabular-nums">
                  {formatMinorAmount(remaining, currency)}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs">Order</p>
                <p className="truncate font-mono text-xs">{payment.orderId}</p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="refund-amount">Refund amount</Label>
              <Input
                id="refund-amount"
                type="number"
                inputMode="decimal"
                min={step}
                max={fromMinorUnits(remaining, currency)}
                step={step}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={String(fromMinorUnits(remaining, currency))}
              />
              <p className="text-muted-foreground text-xs">
                Leave the full remaining amount to refund completely.
              </p>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={
              refundMutation.isPending ||
              !amount ||
              !Number.isFinite(Number(amount))
            }
          >
            {refundMutation.isPending ? "Refunding…" : "Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PaymentsPanelProps = {
  formId: string;
  /**
   * `compact` renders a dashboard preview (analytics); `full` renders the
   * filterable, paginated ledger on the payments page.
   */
  variant?: "compact" | "full";
  onViewAll?: () => void;
};

export function PaymentsPanel({
  formId,
  variant = "full",
  onViewAll,
}: PaymentsPanelProps) {
  const compact = variant === "compact";
  const utils = trpc.useUtils();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [refundTarget, setRefundTarget] = useState<PaymentRow | null>(null);
  const pageSize = compact ? 5 : 20;

  const paymentsQuery = trpc.payment.list.useQuery(
    {
      formId,
      page: compact ? 1 : page,
      pageSize,
      ...(status === "all" ? {} : { status }),
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(from ? { from: `${from}T00:00:00` } : {}),
      ...(to ? { to: `${to}T23:59:59.999` } : {}),
    },
    {
      enabled: !!formId,
      placeholderData: keepPreviousData,
      refetchInterval: 15_000,
    },
  );

  const data = paymentsQuery.data;
  const payments = data?.payments ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const totals = data?.totals;
  const primaryCurrency = payments[0]?.currency ?? "INR";

  const handleRefresh = async () => {
    await utils.payment.list.invalidate({ formId });
    toast.success("Payments refreshed");
  };

  if (paymentsQuery.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: compact ? 3 : 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (paymentsQuery.isError) {
    return (
      <Card>
        <CardContent className="py-10">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Couldn&apos;t load payments</EmptyTitle>
              <EmptyDescription>
                {paymentsQuery.error.message || "Please try again."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => void paymentsQuery.refetch()}>
                Retry
              </Button>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  // The compact analytics card is inert until the form has taken a payment.
  if (compact && !totals?.count) return null;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCardIcon className="text-muted-foreground size-4" />
                Payments
                {!compact ? (
                  <Badge variant="secondary" className="gap-1.5">
                    <RefreshCwIcon className="size-3 animate-pulse" />
                    Live
                  </Badge>
                ) : null}
              </CardTitle>
              <CardDescription>
                {compact
                  ? "Razorpay orders for this form, refreshed every 15s."
                  : "Every Razorpay order, with refunds handled in place."}
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm">
              <LedgerStat
                label="Collected"
                value={formatMinorAmount(
                  totals?.paidAmountPaise ?? 0,
                  primaryCurrency,
                )}
                hint={`${totals?.paidCount ?? 0} paid`}
              />
              <LedgerStat
                label="Pending"
                value={formatMinorAmount(
                  totals?.pendingAmountPaise ?? 0,
                  primaryCurrency,
                )}
                hint={`${totals?.pendingCount ?? 0} open`}
              />
              <LedgerStat
                label="Refunded"
                value={formatMinorAmount(
                  totals?.refundedAmountPaise ?? 0,
                  primaryCurrency,
                )}
                hint={`${totals?.refundedCount ?? 0} refunded`}
              />
            </div>
          </div>

          {compact ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground text-sm">
                Latest {payments.length} of {totals?.count ?? 0} orders
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => void handleRefresh()}>
                  <RefreshCwIcon />
                  Refresh
                </Button>
                {onViewAll ? (
                  <Button variant="outline" size="sm" onClick={onViewAll}>
                    View all
                    <ArrowRightIcon />
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input
                  aria-label="Search order or payment id"
                  placeholder="Search order or payment id…"
                  className="h-9 pl-8"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value as StatusFilter);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-full lg:w-40" aria-label="Filter by status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="created">Pending</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2 lg:w-auto">
                <Input
                  type="date"
                  aria-label="From date"
                  className="h-9"
                  value={from}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    setPage(1);
                  }}
                />
                <Input
                  type="date"
                  aria-label="To date"
                  className="h-9"
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <Button variant="outline" className="h-9" onClick={() => void handleRefresh()}>
                <RefreshCwIcon />
                Refresh
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {payments.length === 0 ? (
            <div className="px-6 py-12">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CreditCardIcon />
                  </EmptyMedia>
                  <EmptyTitle>No payments match</EmptyTitle>
                  <EmptyDescription>
                    {status !== "all" || search.trim() || from || to
                      ? "Try clearing the filters to see more orders."
                      : "Orders appear here once visitors start paying."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : compact ? (
            <div className="divide-y">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between gap-3 px-6 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="line-clamp-1">{payment.fieldLabel ?? "Payment"}</p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {format(new Date(payment.createdAt), "MMM d, HH:mm")} ·{" "}
                      {payment.orderId}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono tabular-nums">
                      {formatMinorAmount(payment.amountPaise, payment.currency)}
                    </span>
                    <PaymentStatusBadge status={payment.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead className="hidden md:table-cell">Order</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => {
                    const remaining = remainingRefundable(payment);
                    return (
                      <TableRow key={payment.id}>
                        <TableCell className="text-muted-foreground whitespace-nowrap tabular-nums">
                          {format(new Date(payment.createdAt), "MMM d, yyyy HH:mm")}
                        </TableCell>
                        <TableCell>
                          <p className="line-clamp-1">
                            {payment.fieldLabel ?? "Payment"}
                          </p>
                          {payment.refundedAmountPaise > 0 ? (
                            <p className="text-muted-foreground text-xs tabular-nums">
                              {paymentTotalLabel(payment)}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="hidden max-w-48 md:table-cell">
                          <p className="truncate font-mono text-xs">{payment.orderId}</p>
                          {payment.paymentId ? (
                            <p className="text-muted-foreground truncate font-mono text-xs">
                              {payment.paymentId}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatMinorAmount(payment.amountPaise, payment.currency)}
                        </TableCell>
                        <TableCell>
                          <PaymentStatusBadge status={payment.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            {payment.status === "paid" && remaining > 0 ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setRefundTarget(payment)}
                              >
                                <Undo2Icon />
                                Refund
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {!compact && totalPages > 1 ? (
            <div className="flex flex-col items-center justify-between gap-2 border-t px-4 py-3 sm:flex-row">
              <p className="text-muted-foreground text-sm tabular-nums">
                Page {page} of {totalPages} · {total} orders
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeftIcon />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  Next
                  <ChevronRightIcon />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!compact ? (
        <RefundDialog payment={refundTarget} onClose={() => setRefundTarget(null)} />
      ) : null}
    </>
  );
}
