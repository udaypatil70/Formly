import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeftIcon,
  ChartColumnIcon,
  EyeIcon,
  InboxIcon,
  PercentIcon,
  TimerIcon,
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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";

type TrendPoint = { date: string; views: number; responses: number };
type FieldBreakdown = { value: string; count: number };

const chartConfig = {
  views: { label: "Views", color: "hsl(var(--chart-1))" },
  responses: { label: "Responses", color: "hsl(var(--chart-2))" },
} as const;

export function AnalyticsPage() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();

  const formQuery = trpc.form.getById.useQuery(
    { id: formId ?? "" },
    { enabled: !!formId },
  );
  const statsQuery = trpc.analytics.getStats.useQuery(
    { formId: formId ?? "" },
    { enabled: !!formId },
  );
  const breakdownQuery = trpc.analytics.getFieldBreakdown.useQuery(
    { formId: formId ?? "" },
    { enabled: !!formId },
  );

  const trend = useMemo<TrendPoint[]>(() => {
    const byDate = new Map<string, TrendPoint>();
    for (const day of statsQuery.data?.dailyViews ?? []) {
      byDate.set(day.date, { date: day.date, views: day.count, responses: 0 });
    }
    for (const day of statsQuery.data?.dailyResponses ?? []) {
      const existing = byDate.get(day.date) ?? {
        date: day.date,
        views: 0,
        responses: 0,
      };
      existing.responses = day.count;
      byDate.set(day.date, existing);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [statsQuery.data]);

  const loading = statsQuery.isLoading || breakdownQuery.isLoading;
  const failed = statsQuery.isError || breakdownQuery.isError;

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
          onClick={() => navigate("/")}
        >
          <ArrowLeftIcon />
          Back to forms
        </Button>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          Analytics
          {formQuery.data && (
            <span className="text-muted-foreground text-base font-normal">
              · {formQuery.data.form.title}
            </span>
          )}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Performance and response insights for this form.
        </p>
      </div>

      <Separator />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
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
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              label="Views"
              value={statsQuery.data.views.toLocaleString()}
              icon={EyeIcon}
            />
            <StatsCard
              label="Responses"
              value={statsQuery.data.responses.toLocaleString()}
              icon={InboxIcon}
            />
            <StatsCard
              label="Completion rate"
              value={`${Math.round(statsQuery.data.completionRate * 100)}%`}
              icon={PercentIcon}
              hint="Responses ÷ views"
            />
            <StatsCard
              label="Avg completion time"
              value={formatDuration(statsQuery.data.avgCompletionSeconds)}
              icon={TimerIcon}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ChartColumnIcon className="text-muted-foreground size-4" />
                Activity over time
              </CardTitle>
              <CardDescription>
                Daily views and responses across the last {trend.length || "…"}
                day{trend.length === 1 ? "" : "s"}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {trend.length === 0 ? (
                <Empty className="py-8">
                  <EmptyDescription>
                    No activity recorded yet for this form.
                  </EmptyDescription>
                </Empty>
              ) : (
                <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
                  <AreaChart data={trend} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={24}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      width={32}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      dataKey="views"
                      type="monotone"
                      fill="var(--color-views)"
                      fillOpacity={0.3}
                      stroke="var(--color-views)"
                      strokeWidth={2}
                      stackId="a"
                    />
                    <Area
                      dataKey="responses"
                      type="monotone"
                      fill="var(--color-responses)"
                      fillOpacity={0.3}
                      stroke="var(--color-responses)"
                      strokeWidth={2}
                      stackId="a"
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

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
      )}
    </div>
  );
}

function StatsCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardDescription>{label}</CardDescription>
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

function FieldBreakdownCard({
  label,
  type,
  breakdown,
}: {
  label: string;
  type: string;
  breakdown: FieldBreakdown[];
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

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "\u2014";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}