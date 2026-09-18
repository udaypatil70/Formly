import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import {
  ArrowLeftIcon,
  ChartColumnIcon,
  CreditCardIcon,
  EyeIcon,
  InboxIcon,
  TrendingUpIcon,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { trpc } from "~/trpc/client";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

type TrendPoint = { date: string; views: number; responses: number };
type PieDatum = { name: string; value: number; pct: number; color: string };
type BreakdownRecord = Record<string, number>;

const lineConfig = {
  views: { label: "Views", color: "hsl(var(--chart-1))" },
  responses: { label: "Responses", color: "hsl(var(--chart-2))" },
} as const;

const barConfig = {
  responses: { label: "Responses", color: "hsl(var(--chart-2))" },
} as const;

const deviceConfig = {
  desktop: { label: "Desktop", color: "hsl(var(--chart-1))" },
  mobile: { label: "Mobile", color: "hsl(var(--chart-2))" },
  tablet: { label: "Tablet", color: "hsl(var(--chart-3))" },
  unknown: { label: "Unknown", color: "hsl(var(--chart-4))" },
} as const;

const browserConfig = {
  chrome: { label: "Chrome", color: "hsl(var(--chart-1))" },
  safari: { label: "Safari", color: "hsl(var(--chart-2))" },
  firefox: { label: "Firefox", color: "hsl(var(--chart-3))" },
  edge: { label: "Edge", color: "hsl(var(--chart-4))" },
  other: { label: "Other", color: "hsl(var(--chart-5))" },
} as const;

const shortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? iso : format(d, "MMM d");
};

export function AnalyticsPage() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();

  const formQuery = trpc.form.getById.useQuery(
    { id: formId ?? "" },
    { enabled: !!formId },
  );
  const statsQuery = trpc.analytics.getStats.useQuery(
    { formId: formId ?? "" },
    { enabled: !!formId, refetchInterval: 5_000 },
  );
  const dropOffQuery = trpc.analytics.getDropOff.useQuery(
    { formId: formId ?? "" },
    { enabled: !!formId },
  );
  const breakdownQuery = trpc.analytics.getFieldBreakdown.useQuery(
    { formId: formId ?? "" },
    { enabled: !!formId },
  );

  const [hidden, setHidden] = useState<{ views: boolean; responses: boolean }>(
    { views: false, responses: false },
  );

  const stats = statsQuery.data;

  const trend = useMemo<TrendPoint[]>(() => {
    const byDate = new Map<string, TrendPoint>();
    for (const day of stats?.dailyViews ?? []) {
      byDate.set(day.date, { date: day.date, views: day.count, responses: 0 });
    }
    for (const day of stats?.dailyResponses ?? []) {
      const existing = byDate.get(day.date) ?? {
        date: day.date,
        views: 0,
        responses: 0,
      };
      existing.responses = day.count;
      byDate.set(day.date, existing);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [stats?.dailyViews, stats?.dailyResponses]);

  const trend30 = trend.slice(-30);
  const trend14 = trend.slice(-14);

  const deviceData = useMemo<PieDatum[]>(
    () => toPieData(stats?.deviceBreakdown, deviceConfig),
    [stats?.deviceBreakdown],
  );
  const browserData = useMemo<PieDatum[]>(
    () => toPieData(stats?.browserBreakdown, browserConfig),
    [stats?.browserBreakdown],
  );

  const loading =
    statsQuery.isLoading || dropOffQuery.isLoading || breakdownQuery.isLoading;
  const failed = statsQuery.isError || dropOffQuery.isError;

  const renderDashboard = () => {
    const s = statsQuery.data;
    const dropOff = dropOffQuery.data;
    if (!s || !dropOff) return null;

    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Total views" value={s.views.toLocaleString()} icon={EyeIcon} />
          <StatCard
            label="Total responses"
            value={s.responses.toLocaleString()}
            icon={InboxIcon}
            live
            hint="Refreshes every 5s"
          />
          <StatCard label="Today views" value={s.viewsToday.toLocaleString()} icon={EyeIcon} />
          <StatCard label="Today responses" value={s.responsesToday.toLocaleString()} icon={InboxIcon} />
          <StatCard label="This week views" value={s.viewsThisWeek.toLocaleString()} icon={EyeIcon} />
          <StatCard label="This week responses" value={s.responsesThisWeek.toLocaleString()} icon={InboxIcon} />
        </div>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUpIcon className="text-muted-foreground size-4" />
                Daily activity
              </CardTitle>
              <CardDescription>
                Views and responses over the last {trend30.length} days. Click
                a series to toggle it.
              </CardDescription>
            </div>
            <div className="flex gap-4">
              {(["views", "responses"] as const).map((key) => {
                const visible = !hidden[key];
                const total = trend30.reduce((sum, d) => sum + d[key], 0);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setHidden((prev) => ({ ...prev, [key]: !prev[key] }))
                    }
                    className={cn(
                      "flex items-center gap-1.5 text-xs transition-opacity",
                      !visible && "text-muted-foreground opacity-50",
                    )}
                  >
                    <span
                      className="size-2 rounded-[2px]"
                      style={{ background: lineConfig[key].color }}
                    />
                    {lineConfig[key].label}
                    <span className="font-mono tabular-nums">
                      {visible ? total : "hidden"}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardHeader>
          <CardContent>
            {trend30.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                No activity recorded yet for this form.
              </p>
            ) : (
              <ChartContainer config={lineConfig} className="aspect-auto h-72 w-full">
                <AreaChart data={trend30} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={24}
                    tickFormatter={shortDate}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(v) => shortDate(v as string)}
                      />
                    }
                  />
                  <Area
                    dataKey="views"
                    type="monotone"
                    fill="var(--color-views)"
                    fillOpacity={0.3}
                    stroke="var(--color-views)"
                    strokeWidth={2}
                    hide={hidden.views}
                  />
                  <Area
                    dataKey="responses"
                    type="monotone"
                    fill="var(--color-responses)"
                    fillOpacity={0.3}
                    stroke="var(--color-responses)"
                    strokeWidth={2}
                    hide={hidden.responses}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ChartColumnIcon className="text-muted-foreground size-4" />
                Responses per day
              </CardTitle>
              <CardDescription>Last {trend14.length} days.</CardDescription>
            </CardHeader>
            <CardContent>
              {trend14.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  No responses yet.
                </p>
              ) : (
                <ChartContainer config={barConfig} className="aspect-auto h-56 w-full">
                  <BarChart data={trend14} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={16}
                      tickFormatter={shortDate}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      width={32}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(v) => shortDate(v as string)}
                        />
                      }
                      cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
                    />
                    <Bar
                      dataKey="responses"
                      fill="var(--color-responses)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={36}
                    />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <DropOffCard
            views={dropOff.views}
            responses={dropOff.responses}
            completionRate={dropOff.completionRate}
            avgCompletionSeconds={dropOff.avgCompletionSeconds}
            coverage={dropOff.fieldCoverage}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <PieCard title="Devices" data={deviceData} />
          <PieCard title="Browsers" data={browserData} />
        </div>

        <PaymentsCard formId={formId ?? ""} />

        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <ChartColumnIcon className="text-muted-foreground size-4" />
            Field breakdown
          </h2>
          {(breakdownQuery.data?.fields ?? []).filter(
            (f) => f.type !== "page_break" && f.breakdown.length > 0,
          ).length === 0 ? (
            <Card>
              <CardContent>
                <p className="text-muted-foreground py-6 text-center text-sm">
                  No answers recorded for this form yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {(breakdownQuery.data?.fields ?? [])
                .filter((f) => f.type !== "page_break" && f.breakdown.length > 0)
                .map((field) => (
                  <FieldBreakdownCard
                    key={field.id}
                    label={field.label}
                    type={field.type}
                    breakdown={field.breakdown}
                  />
                ))}
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeftIcon />
          Back to forms
        </Button>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ChartColumnIcon className="size-6" />
            Analytics
            {formQuery.data && (
              <span className="text-muted-foreground text-base font-normal">
                · {formQuery.data.form.title}
              </span>
            )}
          </h1>
          {statsQuery.data && <LiveBadge />}
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Performance, audience, and drop-off insights for this form.
        </p>
      </div>

      <Separator />

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      ) : failed || !statsQuery.data ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Failed to load analytics</EmptyTitle>
            <EmptyDescription>
              Couldn&apos;t fetch analytics for this form. Please try again.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => void statsQuery.refetch()}>
              Retry
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        renderDashboard()
      )}
    </div>
  );
}

function toPieData(
  breakdown?: BreakdownRecord,
  config?: { [k: string]: { label: string; color: string } },
): PieDatum[] {
  if (!breakdown || !config) return [];
  const total = Object.values(breakdown).reduce((sum, n) => sum + n, 0);
  if (total === 0) return [];
  return Object.entries(breakdown)
    .filter(([key, value]) => value > 0 && config[key])
    .map(([key, value]) => {
      const item = config[key];
      if (!item) return null;
      return {
        name: item.label,
        value,
        pct: Math.round((value / total) * 100),
        color: item.color,
      };
    })
    .filter((d): d is PieDatum => d !== null)
    .sort((a, b) => b.value - a.value);
}

function LiveBadge() {
  return (
    <Badge variant="secondary" className="gap-1.5">
      <span className="relative flex size-2">
        <span className="bg-emerald-500 absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
        <span className="bg-emerald-500 relative inline-flex size-2 rounded-full" />
      </span>
      Live
    </Badge>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  live = false,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  live?: boolean;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardDescription className="flex items-center gap-2">
          {live && (
            <span className="relative flex size-2">
              <span className="bg-emerald-500 absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
              <span className="bg-emerald-500 relative inline-flex size-2 rounded-full" />
            </span>
          )}
          {label}
        </CardDescription>
        <Icon className="text-muted-foreground size-4" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? (
          <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DropOffCard({
  views,
  responses,
  completionRate,
  avgCompletionSeconds,
  coverage,
}: {
  views: number;
  responses: number;
  completionRate: number;
  avgCompletionSeconds: number | null;
  coverage: Array<{
    label: string;
    answered: number;
    totalResponses: number;
  }>;
}) {
  const dropPct = views > 0 ? Math.round((1 - completionRate) * 100) : 0;
  const completionPct = Math.round(completionRate * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Drop-off analysis</CardTitle>
        <CardDescription>
          From opening the form to submitting it, and coverage per field.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <FunnelRow
            label="Form views"
            pct={100}
            count={views}
            color="hsl(var(--chart-1))"
          />
          <div className="flex items-center justify-between pl-1 text-xs">
            <span className="text-muted-foreground">Drop-off before submit</span>
            <span className={cn(completionRate >= 0.4 ? "text-muted-foreground" : "font-medium text-red-500")}>
              {dropPct}% · avg {formatDuration(avgCompletionSeconds)}
            </span>
          </div>
          <FunnelRow
            label="Submissions"
            pct={completionPct}
            count={responses}
            color="hsl(var(--chart-2))"
          />
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Field coverage</p>
          {coverage.length === 0 ? (
            <p className="text-muted-foreground py-2 text-center text-sm">
              No fields on this form yet.
            </p>
          ) : (
            coverage.map((field) => {
              const pct =
                field.totalResponses > 0
                  ? Math.round((field.answered / field.totalResponses) * 100)
                  : 0;
              const color =
                field.totalResponses === 0
                  ? "hsl(var(--muted-foreground))"
                  : pct >= 70
                    ? "hsl(var(--chart-2))"
                    : pct >= 30
                      ? "hsl(var(--chart-3))"
                      : "hsl(var(--chart-4))";
              return (
                <div key={field.label} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="line-clamp-1">{field.label}</span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {field.totalResponses > 0 ? `${pct}%` : "\u2014"} ·{" "}
                      {field.answered}/{field.totalResponses}
                    </span>
                  </div>
                  <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FunnelRow({
  label,
  pct,
  count,
  color,
}: {
  label: string;
  pct: number;
  count: number;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {count.toLocaleString()} · {pct}%
        </span>
      </div>
      <div className="bg-muted h-3 w-full overflow-hidden rounded-md">
        <div
          className="h-full rounded-md transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function PieCard({
  title,
  data,
}: {
  title: string;
  data: PieDatum[];
}) {
  const [active, setActive] = useState(-1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No data yet. Share your form to start collecting traffic.
          </p>
        ) : (
          <>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    onMouseEnter={(_, index) => setActive(index)}
                    onMouseLeave={() => setActive(-1)}
                  >
                    {data.map((d, i) => (
                      <Cell
                        key={d.name}
                        fill={d.color}
                        opacity={active === -1 || active === i ? 1 : 0.35}
                        strokeWidth={active === i ? 2 : 0}
                        stroke="var(--background)"
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} cursor={false} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
              {data.map((d) => (
                <li
                  key={d.name}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="text-muted-foreground flex min-w-0 items-center gap-1.5">
                    <span
                      className="size-2 shrink-0 rounded-[2px]"
                      style={{ background: d.color }}
                    />
                    <span className="line-clamp-1">{d.name}</span>
                  </span>
                  <span className="font-mono tabular-nums">
                    {d.value}{" "}
                    <span className="text-muted-foreground">({d.pct}%)</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-3 text-xs">
              Based on {totalOf(data)} visitors. Hover a slice to highlight.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: PieDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  return (
    <div className="border-border/50 bg-background grid min-w-[8rem] items-start gap-1 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-[2px]" style={{ background: item.color }} />
        <span className="text-muted-foreground">{item.name}</span>
      </span>
      <span className="font-mono font-medium tabular-nums">
        {item.value.toLocaleString()} ({item.pct}%)
      </span>
    </div>
  );
}

function totalOf(data: PieDatum[]) {
  return data.reduce((sum, d) => sum + d.value, 0).toLocaleString();
}

function FieldBreakdownCard({
  label,
  type,
  breakdown,
}: {
  label: string;
  type: string;
  breakdown: Array<{ value: string; count: number }>;
}) {
  const max = Math.max(...breakdown.map((b) => b.count), 1);
  const total = breakdown.reduce((sum, b) => sum + b.count, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="line-clamp-1 text-base">{label}</CardTitle>
        <Badge variant="secondary" className="shrink-0 font-mono uppercase">
          {type}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {breakdown.map((item, index) => (
          <div key={index} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="line-clamp-1">{item.value}</span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {total > 0 ? Math.round((item.count / total) * 100) : 0}% ·{" "}
                {item.count}
              </span>
            </div>
            <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max((item.count / max) * 100, 4)}%`,
                  backgroundColor: `hsl(var(--chart-${(index % 5) + 1}))`,
                }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PaymentsCard({ formId }: { formId: string }) {
  const paymentsQuery = trpc.payment.list.useQuery(
    { formId },
    { enabled: !!formId, refetchInterval: 10_000 },
  );

  const data = paymentsQuery.data;
  if (!data || data.totals.count === 0) return null;

  const currency = data.payments[0]?.currency ?? "INR";
  const fmt = (paise: number) =>
    `${currency} ${paise.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CreditCardIcon className="text-muted-foreground size-4" />
            Payments
            <Badge variant="secondary" className="gap-1.5">
              <span className="relative flex size-2">
                <span className="bg-emerald-500 absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
                <span className="bg-emerald-500 relative inline-flex size-2 rounded-full" />
              </span>
              Live
            </Badge>
          </CardTitle>
          <CardDescription>
            Razorpay orders for this form, refreshed every 10s.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <LedgerStat label="Collected" value={fmt(data.totals.paidAmountPaise)} hint={`${data.totals.paidCount} paid`} />
          <LedgerStat label="Pending" value={fmt(data.totals.pendingAmountPaise)} hint={`${data.totals.pendingCount} open`} />
          <LedgerStat label="Refunded" value={fmt(data.totals.refundedAmountPaise)} hint={`${data.totals.refundedCount} refunded`} />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {data.payments.slice(0, 25).map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-6 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="line-clamp-1">{p.fieldLabel ?? "Payment"}</p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {format(new Date(p.createdAt), "MMM d, HH:mm")} · {p.orderId}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono tabular-nums">{fmt(p.amountPaise)}</span>
                <PaymentStatusBadge status={p.status} />
              </div>
            </div>
          ))}
        </div>
        {data.payments.length > 25 ? (
          <p className="text-muted-foreground border-t px-6 py-2 text-xs">
            Showing 25 of {data.payments.length} orders.
          </p>
        ) : null}
      </CardContent>
    </Card>
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
    <div className="min-w-[5rem]">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const classes =
    status === "paid"
      ? "bg-emerald-500/15 text-emerald-400"
      : status === "refunded"
        ? "bg-amber-500/15 text-amber-400"
        : status === "failed"
          ? "bg-destructive/15 text-destructive"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>
      {status}
    </span>
  );
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "\u2014";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}