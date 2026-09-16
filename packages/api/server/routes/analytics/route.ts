import { z } from "zod";
import { db, eq, count, avg } from "@repo/db";
import {
  answersTable,
  fieldsTable,
  formViewsTable,
  responsesTable,
} from "@repo/db/schema";
import { router, protectedProcedure } from "../../trpc";
import { assertFormOwner } from "../form/route";

const TAGS = ["Analytics"];

const formIdInput = z.object({ formId: z.string().uuid() });

const toDayBucket = (date: Date) => date.toISOString().slice(0, 10);

const DEVICE_KEYS = ["desktop", "mobile", "tablet", "unknown"] as const;
const BROWSER_KEYS = ["chrome", "safari", "firefox", "edge", "other"] as const;

export const analyticsRouter = router({
  /** Core stats: views, responses, completion rate, avg time, daily trend. */
  getStats: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/analytics/{formId}", tags: TAGS } })
    .input(formIdInput)
    .output(
      z.object({
        views: z.number(),
        responses: z.number(),
        viewsToday: z.number(),
        responsesToday: z.number(),
        viewsThisWeek: z.number(),
        responsesThisWeek: z.number(),
        completionRate: z.number(),
        avgCompletionSeconds: z.number().nullable(),
        dailyViews: z.array(
          z.object({ date: z.string(), count: z.number() }),
        ),
        dailyResponses: z.array(
          z.object({ date: z.string(), count: z.number() }),
        ),
        deviceBreakdown: z.object({
          desktop: z.number(),
          mobile: z.number(),
          tablet: z.number(),
          unknown: z.number(),
        }),
        browserBreakdown: z.object({
          chrome: z.number(),
          safari: z.number(),
          firefox: z.number(),
          edge: z.number(),
          other: z.number(),
        }),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertFormOwner(input.formId, ctx.user.id);

      const [viewsRow] = await db
        .select({ count: count() })
        .from(formViewsTable)
        .where(eq(formViewsTable.formId, input.formId))
        .execute();

      const [responsesRow] = await db
        .select({ count: count() })
        .from(responsesTable)
        .where(eq(responsesTable.formId, input.formId))
        .execute();

      const [avgRow] = await db
        .select({ avg: avg(responsesTable.completedInSeconds) })
        .from(responsesTable)
        .where(eq(responsesTable.formId, input.formId))
        .execute();

      const views = Number(viewsRow?.count ?? 0);
      const responses = Number(responsesRow?.count ?? 0);
      const completionRate = views > 0 ? responses / views : 0;
      const avgSeconds =
        avgRow?.avg != null ? Number(avgRow.avg) : null;

      const viewsData = await db
        .select({
          viewedAt: formViewsTable.viewedAt,
          device: formViewsTable.device,
          browser: formViewsTable.browser,
        })
        .from(formViewsTable)
        .where(eq(formViewsTable.formId, input.formId))
        .execute();

      const responsesData = await db
        .select({ submittedAt: responsesTable.submittedAt })
        .from(responsesTable)
        .where(eq(responsesTable.formId, input.formId))
        .execute();

      const now = new Date();
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).getTime();
      const startOfWeek =
        startOfToday - ((now.getDay() + 6) % 7) * 86_400_000;

      let viewsToday = 0;
      let viewsThisWeek = 0;
      const deviceBreakdown = { desktop: 0, mobile: 0, tablet: 0, unknown: 0 };
      const browserBreakdown = { chrome: 0, safari: 0, firefox: 0, edge: 0, other: 0 };
      const dailyViews = new Map<string, number>();
      for (const row of viewsData) {
        const ts = row.viewedAt.getTime();
        dailyViews.set(toDayBucket(row.viewedAt), (dailyViews.get(toDayBucket(row.viewedAt)) ?? 0) + 1);
        if (ts >= startOfToday) viewsToday += 1;
        if (ts >= startOfWeek) viewsThisWeek += 1;
        const device = DEVICE_KEYS.includes(row.device as never)
          ? (row.device as (typeof DEVICE_KEYS)[number])
          : "unknown";
        deviceBreakdown[device] += 1;
        const browser = BROWSER_KEYS.includes(row.browser as never)
          ? (row.browser as (typeof BROWSER_KEYS)[number])
          : "other";
        browserBreakdown[browser] += 1;
      }

      let responsesToday = 0;
      let responsesThisWeek = 0;
      const dailyResponses = new Map<string, number>();
      for (const row of responsesData) {
        const ts = row.submittedAt.getTime();
        dailyResponses.set(toDayBucket(row.submittedAt), (dailyResponses.get(toDayBucket(row.submittedAt)) ?? 0) + 1);
        if (ts >= startOfToday) responsesToday += 1;
        if (ts >= startOfWeek) responsesThisWeek += 1;
      }

      return {
        views,
        responses,
        viewsToday,
        responsesToday,
        viewsThisWeek,
        responsesThisWeek,
        completionRate,
        avgCompletionSeconds: avgSeconds,
        dailyViews: Array.from(dailyViews.entries()).map(([date, count]) => ({
          date,
          count,
        })),
        dailyResponses: Array.from(dailyResponses.entries()).map(
          ([date, count]) => ({ date, count }),
        ),
        deviceBreakdown,
        browserBreakdown,
      };
    }),

  /** Per-field answer distribution (option counts for selects, value counts otherwise). */
  getFieldBreakdown: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/analytics/{formId}/fields",
        tags: TAGS,
      },
    })
    .input(formIdInput)
    .output(
      z.object({
        fields: z.array(
          z.object({
            id: z.string().uuid(),
            label: z.string(),
            type: z.string(),
            breakdown: z.array(
              z.object({ value: z.string(), count: z.number() }),
            ),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertFormOwner(input.formId, ctx.user.id);

      const fields = await db
        .select()
        .from(fieldsTable)
        .where(eq(fieldsTable.formId, input.formId))
        .orderBy(fieldsTable.order)
        .execute();

      const rows = await db
        .select({
          fieldId: answersTable.fieldId,
          value: answersTable.value,
          count: count(),
        })
        .from(answersTable)
        .innerJoin(
          responsesTable,
          eq(responsesTable.id, answersTable.responseId),
        )
        .where(eq(responsesTable.formId, input.formId))
        .groupBy(answersTable.fieldId, answersTable.value)
        .execute();

      const countsByField = new Map<string, Map<string, number>>();
      for (const row of rows) {
        const key = Array.isArray(row.value)
          ? row.value.join("; ")
          : row.value == null
            ? "(empty)"
            : String(row.value);
        const map = countsByField.get(row.fieldId) ?? new Map<string, number>();
        map.set(key, (map.get(key) ?? 0) + row.count);
        countsByField.set(row.fieldId, map);
      }

      return {
        fields: fields.map((field) => ({
          id: field.id,
          label: field.label,
          type: field.type,
          breakdown: Array.from((countsByField.get(field.id) ?? new Map()).entries()).map(
            ([value, count]) => ({ value, count }),
          ),
        })),
      };
    }),

  /** Drop-off: overall funnel (views -> responses) + per-field answer coverage. */
  getDropOff: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/analytics/{formId}/dropoff",
        tags: TAGS,
      },
    })
    .input(formIdInput)
    .output(
      z.object({
        views: z.number(),
        responses: z.number(),
        completionRate: z.number(),
        avgCompletionSeconds: z.number().nullable(),
        fieldCoverage: z.array(
          z.object({
            fieldId: z.string().uuid(),
            label: z.string(),
            order: z.number(),
            answered: z.number(),
            totalResponses: z.number(),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertFormOwner(input.formId, ctx.user.id);

      const fields = await db
        .select({
          id: fieldsTable.id,
          label: fieldsTable.label,
          order: fieldsTable.order,
          type: fieldsTable.type,
        })
        .from(fieldsTable)
        .where(eq(fieldsTable.formId, input.formId))
        .orderBy(fieldsTable.order)
        .execute();

      const [viewsRow] = await db
        .select({ count: count() })
        .from(formViewsTable)
        .where(eq(formViewsTable.formId, input.formId))
        .execute();

      const [responsesRow] = await db
        .select({ count: count() })
        .from(responsesTable)
        .where(eq(responsesTable.formId, input.formId))
        .execute();

      const [avgRow] = await db
        .select({ avg: avg(responsesTable.completedInSeconds) })
        .from(responsesTable)
        .where(eq(responsesTable.formId, input.formId))
        .execute();

      const answerRows = await db
        .select({
          fieldId: answersTable.fieldId,
          count: count(),
        })
        .from(answersTable)
        .innerJoin(
          responsesTable,
          eq(responsesTable.id, answersTable.responseId),
        )
        .where(eq(responsesTable.formId, input.formId))
        .groupBy(answersTable.fieldId)
        .execute();

      const answeredByField = new Map<string, number>();
      for (const row of answerRows) {
        answeredByField.set(row.fieldId, Number(row.count));
      }

      const views = Number(viewsRow?.count ?? 0);
      const totalResponses = Number(responsesRow?.count ?? 0);
      const avgSeconds =
        avgRow?.avg != null ? Number(avgRow.avg) : null;

      return {
        views,
        responses: totalResponses,
        completionRate: views > 0 ? totalResponses / views : 0,
        avgCompletionSeconds: avgSeconds,
        fieldCoverage: fields
          .filter((f) => f.type !== "page_break")
          .map((f) => ({
            fieldId: f.id,
            label: f.label,
            order: f.order,
            answered: answeredByField.get(f.id) ?? 0,
            totalResponses,
          })),
      };
    }),
});