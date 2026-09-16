import { z } from "zod";
import { db, eq, and, desc, count, gte, lte, inArray, sql } from "@repo/db";
import {
  answersTable,
  fieldsTable,
  formsTable,
  responsesTable,
} from "@repo/db/schema";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../trpc";
import { getFieldsForForm } from "../../utils/form";
import { assertFormOwner } from "../form/route";

const TAGS = ["Responses"];

const listInput = z.object({
  formId: z.string().uuid(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().max(100).optional(),
});

const deleteInput = z.object({ id: z.string().uuid() });

export const responseViewOutput = z.object({
  id: z.string().uuid(),
  submittedAt: z.string(),
  completedInSeconds: z.number().int().nullable().optional(),
  answers: z.array(
    z.object({
      fieldId: z.string().uuid(),
      fieldLabel: z.string(),
      value: z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.string()),
        z.null(),
      ]),
    }),
  ),
});

export const responseRouter = router({
  /** List responses for a form with pagination + date filtering. */
  list: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/responses", tags: TAGS } })
    .input(listInput)
    .output(
      z.object({
        responses: z.array(responseViewOutput),
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertFormOwner(input.formId, ctx.user.id);
      const { page, pageSize } = input;

      const conditions = [eq(responsesTable.formId, input.formId)];
      if (input.from) conditions.push(gte(responsesTable.submittedAt, new Date(input.from)));
      if (input.to) conditions.push(lte(responsesTable.submittedAt, new Date(input.to)));

      // Text search matches responses whose answer values contain the term.
      const searchTerm = input.search?.trim();
      if (searchTerm) {
        const escaped = searchTerm.replace(/[\\%_]/g, (c) => `\\${c}`);
        const fieldRows = await db
          .selectDistinct({ id: fieldsTable.id })
          .from(fieldsTable)
          .where(eq(fieldsTable.formId, input.formId))
          .execute();
        const fieldIds = fieldRows.map((row) => row.id);
        const matchRows =
          fieldIds.length > 0
            ? await db
                .selectDistinct({ responseId: answersTable.responseId })
                .from(answersTable)
                .where(
                  and(
                    inArray(answersTable.fieldId, fieldIds),
                    sql`${answersTable.value}::text ILIKE ${`%${escaped}%`}`,
                  ),
                )
                .execute()
            : [];
        if (matchRows.length === 0) {
          return { responses: [], total: 0, page, pageSize };
        }
        conditions.push(
          inArray(
            responsesTable.id,
            matchRows.map((m) => m.responseId),
          ),
        );
      }

      const rows = await db
        .select()
        .from(responsesTable)
        .where(and(...conditions))
        .orderBy(desc(responsesTable.submittedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute();

      const [totalRow] = await db
        .select({ total: count() })
        .from(responsesTable)
        .where(and(...conditions))
        .execute();

      const { fields } = await getFieldsForForm(input.formId);
      const labelByFieldId = new Map(
        fields.map((f) => [f.id, f.label] as const),
      );
      const allFieldIds = new Set(fields.map((f) => f.id));

      const responseIds = rows.map((r) => r.id);
      const answers =
        responseIds.length > 0
          ? await db
              .select()
              .from(answersTable)
              .where(inArray(answersTable.responseId, responseIds))
              .execute()
          : [];

      return {
        responses: rows.map((row) => ({
          id: row.id,
          submittedAt: row.submittedAt.toISOString(),
          completedInSeconds: row.completedInSeconds,
          answers: answers
            .filter((a) => a.responseId === row.id)
            .map((a) => ({
              fieldId: a.fieldId,
              fieldLabel: labelByFieldId.get(a.fieldId) ?? "Unknown field",
              value: a.value ?? null,
            })),
        })),
        total: Number(totalRow?.total ?? 0),
        page,
        pageSize,
      };
    }),

  /** Export all responses as CSV for a form. */
  exportCsv: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/responses/csv", tags: TAGS } })
    .input(z.object({ formId: z.string().uuid() }))
    .output(
      z.object({
        filename: z.string(),
        csv: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const form = await assertFormOwner(input.formId, ctx.user.id);

      const { fields } = await getFieldsForForm(input.formId);

      const responseRows = await db
        .select()
        .from(responsesTable)
        .where(eq(responsesTable.formId, input.formId))
        .orderBy(desc(responsesTable.submittedAt))
        .execute();

      const responseIds = responseRows.map((r) => r.id);
      const answerRows =
        responseIds.length > 0
          ? await db
              .select()
              .from(answersTable)
              .where(inArray(answersTable.responseId, responseIds))
              .execute()
          : [];

      const answersByResponse = new Map<string, typeof answerRows>();
      for (const answer of answerRows) {
        const list = answersByResponse.get(answer.responseId) ?? [];
        list.push(answer);
        answersByResponse.set(answer.responseId, list);
      }

      const csvEscape = (value: unknown): string => {
        const str = Array.isArray(value)
          ? value.join("; ")
          : value === null || value === undefined
            ? ""
            : String(value);
        return `"${str.replaceAll('"', '""')}"`;
      };

      const header = [
        '"submitted_at"',
        ...fields.map((f) => csvEscape(f.label)),
        '"completed_in_seconds"',
      ].join(",");

      const rows = responseRows.map((response) => {
        const answers = answersByResponse.get(response.id) ?? [];
        const byField = new Map(answers.map((a) => [a.fieldId, a.value]));
        const cells = fields.map((field) => {
          const cell = byField.get(field.id);
          return csvEscape(cell ?? null);
        });
        return [
          csvEscape(response.submittedAt.toISOString()),
          ...cells,
          csvEscape(response.completedInSeconds ?? null),
        ].join(",");
      });

      const filename = `${form.title.replace(/[^a-z0-9]+/gi, "-")}-responses.csv`;
      return { filename, csv: [header, ...rows].join("\n") };
    }),

  /** Delete a single response (cascades its answers). */
  delete: protectedProcedure
    .meta({ openapi: { method: "DELETE", path: "/responses/{id}", tags: TAGS } })
    .input(deleteInput)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await db
        .select()
        .from(responsesTable)
        .where(eq(responsesTable.id, input.id))
        .limit(1)
        .execute();
      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Response not found" });
      }
      await assertFormOwner(rows[0]!.formId, ctx.user.id);
      await db.delete(responsesTable).where(eq(responsesTable.id, input.id)).execute();
      return { success: true };
    }),
});