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

export const analyticsRouter = router({
  /** Core stats: views, responses, completion rate, avg time, daily trend. */
  getStats: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/analytics/{formId}", tags: TAGS } })
    .input(formIdInput)
    .output(
      z.object({
        views: z.number(),
        responses: z.number(),
        completionRate: z.number(),
        avgCompletionSeconds: z.number().nullable(),
        dailyViews: z.array(
          z.object({ date: z.string(), count: z.number() }),
        ),
        dailyResponses: z.array(
          z.object({ date: z.string(), count: z.number() }),
        ),
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
        .select({ viewedAt: formViewsTable.viewedAt })
        .from(formViewsTable)
        .where(eq(formViewsTable.formId, input.formId))
        .execute();

      const responsesData = await db
        .select({ submittedAt: responsesTable.submittedAt })
        .from(responsesTable)
        .where(eq(responsesTable.formId, input.formId))
        .execute();

      const dailyViews = new Map<string, number>();
      for (const row of viewsData) {
        const day = toDayBucket(row.viewedAt);
        dailyViews.set(day, (dailyViews.get(day) ?? 0) + 1);
      }

      const dailyResponses = new Map<string, number>();
      for (const row of responsesData) {
        const day = toDayBucket(row.submittedAt);
        dailyResponses.set(day, (dailyResponses.get(day) ?? 0) + 1);
      }

      return {
        views,
        responses,
        completionRate,
        avgCompletionSeconds: avgSeconds,
        dailyViews: Array.from(dailyViews.entries()).map(([date, count]) => ({
          date,
          count,
        })),
        dailyResponses: Array.from(dailyResponses.entries()).map(
          ([date, count]) => ({ date, count }),
        ),
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
});