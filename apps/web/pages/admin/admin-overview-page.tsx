import { useMemo } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  EyeIcon,
  FilePlus2Icon,
  InboxIcon,
  LayersIcon,
  RocketIcon,
  StarIcon,
  UsersIcon,
} from "lucide-react";

import { trpc } from "~/trpc/client";
import { Badge } from "~/components/ui/badge";
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
import { Skeleton } from "~/components/ui/skeleton";

const responsesConfig = {
  responses: { label: "Responses", color: "hsl(var(--chart-2))" },
} as const;

const shortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : format(d, "MMM d");
};

export function AdminOverviewPage() {
  const statsQuery = trpc.admin.getStats.useQuery();

  const stats = statsQuery.data;

  const chartData = useMemo(() => {
    return (stats?.dailyResponses ?? []).map((day) => ({ ...day }));
  }, [stats?.dailyResponses]);

  const cards = [
    {
      label: "Users",
      value: stats?.totalUsers ?? 0,
      icon: UsersIcon,
      className: "text-blue-500",
    },
    {
      label: "Forms",
      value: stats?.totalForms ?? 0,
      icon: FilePlus2Icon,
      className: "text-violet-500",
    },
    {
      label: "Published",
      value: stats?.publishedForms ?? 0,
      icon: RocketIcon,
      className: "text-emerald-500",
    },
    {
      label: "Featured",
      value: stats?.featuredForms ?? 0,
      icon: StarIcon,
      className: "text-amber-500",
    },
    {
      label: "Responses",
      value: stats?.totalResponses ?? 0,
      icon: InboxIcon,
      className: "text-pink-500",
    },
    {
      label: "Views",
      value: stats?.totalViews ?? 0,
      icon: EyeIcon,
      className: "text-sky-500",
    },
    {
      label: "Themes",
      value: stats?.totalThemes ?? 0,
      icon: LayersIcon,
      className: "text-fuchsia-500",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Platform-wide metrics and activity.
        </p>
      </div>

      {statsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : statsQuery.isError ? (
        <p className="text-muted-foreground text-sm">
          Failed to load stats. Try again later.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <Card key={card.label} className="bg-card border-border/60">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-muted-foreground text-sm font-medium">
                    {card.label}
                  </CardTitle>
                  <card.icon className={`size-4 ${card.className}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold tabular-nums">
                    {card.value.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Card className="bg-card border-border/60">
              <CardHeader>
                <CardTitle>Responses per day</CardTitle>
                <CardDescription>Last 7 days.</CardDescription>
              </CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center text-sm">
                    No responses yet.
                  </p>
                ) : (
                  <ChartContainer
                    config={responsesConfig}
                    className="aspect-auto h-56 w-full"
                  >
                    <AreaChart data={chartData} margin={{ left: 0, right: 8 }}>
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
                      <Area
                        dataKey="responses"
                        type="monotone"
                        fill="var(--color-responses)"
                        fillOpacity={0.3}
                        stroke="var(--color-responses)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card border-border/60">
              <CardHeader>
                <CardTitle>Top forms</CardTitle>
                <CardDescription>By response count.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(stats?.topForms ?? []).length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center text-sm">
                    No forms yet.
                  </p>
                ) : (
                  (stats?.topForms ?? []).map((form, index) => (
                    <Link
                      key={form.id}
                      to={`/form/${form.slug}`}
                      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:border-violet-500/40"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="text-muted-foreground w-5 text-sm tabular-nums">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {form.title}
                          </p>
                          <p className="text-muted-foreground truncate text-xs">
                            /form/{form.slug}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {form.isFeatured && (
                          <Badge className="gap-1 bg-amber-500 text-white hover:bg-amber-500">
                            <StarIcon className="size-3" />
                            Featured
                          </Badge>
                        )}
                        <span className="text-muted-foreground text-sm tabular-nums">
                          {form.responseCount}
                        </span>
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}