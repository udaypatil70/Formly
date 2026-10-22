import { z } from "zod";
import { db, eq, and, desc, count, gte, lte, inArray, sql } from "@repo/db";
import {
  answersTable,
  fieldsTable,
  formFileUploadsTable,
  formsTable,
  responsesTable,
} from "@repo/db/schema";
import { TRPCError } from "@trpc/server";
import { signUploadPath } from "@repo/services/upload-signature";
import {
  buildResponseSchema,
  type FieldType,
} from "@repo/validators";
import { router, protectedProcedure } from "../../trpc";
import { getFieldsForForm, toValidatorField } from "../../utils/form";
import { assertFormOwner } from "../form/route";
import { emitResponseUpdated } from "../../utils/webhooks";

const TAGS = ["Responses"];

/** Field types whose answers reference rows owned by the response. */
const IMMUTABLE_ANSWER_TYPES = new Set<FieldType>([
  "file_upload",
  "payment",
  "page_break",
]);

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
  editedAt: z.string().nullable().optional(),
  completedInSeconds: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()),
  starred: z.boolean(),
  answers: z.array(
    z.object({
      fieldId: z.string().uuid(),
      fieldLabel: z.string(),
      value: z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.string()),
        z.record(z.string(), z.unknown()),
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
          editedAt: row.editedAt ? row.editedAt.toISOString() : null,
          completedInSeconds: row.completedInSeconds,
          notes: row.notes,
          tags: row.tags ?? [],
          starred: row.starred,
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
        let str: string;
        if (Array.isArray(value)) {
          str = value.join("; ");
        } else if (value === null || value === undefined) {
          str = "";
        } else if (typeof value === "object") {
          const payment = value as { amount?: number; currency?: string };
          if (
            typeof payment.amount === "number" &&
            typeof payment.currency === "string"
          ) {
            str = `Paid ${payment.currency} ${payment.amount}`;
          } else {
            const file = value as { name?: string; url?: string };
            str = file.name ?? (file.url ? String(file.url) : "");
          }
        } else {
          str = String(value);
        }
        return `"${str.replaceAll('"', '""')}"`;
      };

      const header = [
        '"submitted_at"',
        ...fields.map((f) => csvEscape(f.label)),
        '"completed_in_seconds"',
        '"starred"',
        '"tags"',
        '"notes"',
        '"edited_at"',
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
          csvEscape(response.starred ? "yes" : "no"),
          csvEscape(response.tags ?? []),
          csvEscape(response.notes ?? null),
          csvEscape(response.editedAt ? response.editedAt.toISOString() : null),
        ].join(",");
      });

      const filename = `${form.title.replace(/[^a-z0-9]+/gi, "-")}-responses.csv`;
      return { filename, csv: [header, ...rows].join("\n") };
    }),

  /**
   * Edit a stored response's answers.
   *
   * Validated against the form's own field schema, so an edit cannot smuggle in
   * a value the submit path would have rejected — otherwise a `response.updated`
   * event would be able to carry data `response.created` never could.
   *
   * `file_upload` and `payment` fields are refused outright: both reference rows
   * owned by the response (a claimed upload, a captured payment). Re-pointing
   * one at another row would let an owner attach someone else's file to this
   * response, so those answers are left exactly as submitted.
   */
  update: protectedProcedure
    .meta({ openapi: { method: "PATCH", path: "/responses/{id}", tags: TAGS } })
    .input(
      z.object({
        id: z.string().uuid(),
        // Shape is enforced below by the form's own field schema, the same
        // validation a submission goes through.
        answers: z.record(z.string().uuid(), z.unknown()).optional(),
        notes: z.string().max(10_000).nullable().optional(),
        tags: z
          .array(z.string().trim().min(1).max(50))
          .max(20)
          .optional(),
        starred: z.boolean().optional(),
      }),
    )
    .output(responseViewOutput)
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
      const response = rows[0]!;
      const form = await assertFormOwner(response.formId, ctx.user.id);

      const { fields, optionsByField } = await getFieldsForForm(form.id);
      const validatorFields = fields.map((field) =>
        toValidatorField(field, optionsByField.get(field.id)),
      );
      const editableIds = new Set(
        validatorFields
          .filter((f) => f.type !== "page_break" && !IMMUTABLE_ANSWER_TYPES.has(f.type))
          .map((f) => f.id),
      );

      let changed: [string, unknown][] = [];
      if (input.answers) {
        const submittedFieldIds = Object.keys(input.answers);
        const foreign = submittedFieldIds.filter((id) => !editableIds.has(id));
        if (foreign.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `These fields cannot be edited: ${foreign.join(", ")}`,
          });
        }

        // Merge onto the current answers so omitting a field clears nothing.
        const existing = await db
          .select()
          .from(answersTable)
          .where(eq(answersTable.responseId, response.id))
          .execute();
        const merged: Record<string, unknown> = {};
        for (const answer of existing) {
          if (editableIds.has(answer.fieldId)) merged[answer.fieldId] = answer.value;
        }
        Object.assign(merged, input.answers);

        const parsed = buildResponseSchema(validatorFields)
          .partial()
          .safeParse(merged);
        if (!parsed.success) {
          const issues = parsed.error.issues.map(
            (issue) => `${String(issue.path[0])}: ${issue.message}`,
          );
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid response: ${issues.join("; ")}`,
          });
        }
        changed = Object.entries(input.answers).map(([fieldId]) => [
          fieldId,
          parsed.data[fieldId] ?? null,
        ]);
      }

      await db.transaction(async (tx) => {
        if (changed.length > 0) {
          // Replace rather than upsert: an owner clearing a field sends null,
          // and deleting first keeps one row per field without a unique
          // constraint.
          await tx
            .delete(answersTable)
            .where(
              and(
                eq(answersTable.responseId, response.id),
                inArray(
                  answersTable.fieldId,
                  changed.map(([fieldId]) => fieldId),
                ),
              ),
            )
            .execute();
          await tx
            .insert(answersTable)
            .values(
              changed.map(([fieldId, value]) => ({
                responseId: response.id,
                fieldId,
                value: value as never,
              })),
            )
            .execute();
        }

        if (
          input.notes !== undefined ||
          input.tags !== undefined ||
          input.starred !== undefined ||
          changed.length > 0
        ) {
          await tx
            .update(responsesTable)
            .set({
              ...(input.notes !== undefined
                ? { notes: input.notes?.trim() ? input.notes : null }
                : {}),
              ...(input.tags !== undefined
                ? { tags: [...new Set(input.tags)] }
                : {}),
              ...(input.starred !== undefined ? { starred: input.starred } : {}),
              ...(changed.length > 0 ? { editedAt: new Date() } : {}),
            })
            .where(eq(responsesTable.id, response.id))
            .execute();
        }
      });

      const finalAnswers = await db
        .select()
        .from(answersTable)
        .where(eq(answersTable.responseId, response.id))
        .execute();
      const [updated] = await db
        .select()
        .from(responsesTable)
        .where(eq(responsesTable.id, response.id))
        .limit(1)
        .execute();

      if (changed.length > 0) {
        // Emitted from the committed state rather than from what was sent, so a
        // receiver sees the response as it now stands — including answers this
        // edit did not touch — exactly as `response.created` delivered it.
        void emitResponseUpdated({
          form,
          fields: validatorFields,
          answers: Object.fromEntries(
            finalAnswers.map((answer) => [answer.fieldId, answer.value]),
          ),
          responseId: response.id,
          submittedAt: response.submittedAt.toISOString(),
        });
      }

      const labelByFieldId = new Map(
        validatorFields.map((f) => [f.id, f.label] as const),
      );

      return {
        id: response.id,
        submittedAt: response.submittedAt.toISOString(),
        editedAt: updated?.editedAt ? updated.editedAt.toISOString() : null,
        completedInSeconds: response.completedInSeconds,
        notes: updated?.notes ?? null,
        tags: updated?.tags ?? [],
        starred: updated?.starred ?? false,
        answers: finalAnswers.map((answer) => ({
          fieldId: answer.fieldId,
          fieldLabel: labelByFieldId.get(answer.fieldId) ?? "Unknown field",
          value: answer.value ?? null,
        })),
      };
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

  /**
   * Lists a form's uploads with a fresh signed download URL for each.
   *
   * Stored answers keep whatever URL was minted when the submission was made,
   * so this is how the owner reaches a file whose link has since expired.
   */
  listFileUploads: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/responses/{formId}/uploads", tags: TAGS } })
    .input(z.object({ formId: z.string().uuid() }))
    .output(
      z.object({
        uploads: z.array(
          z.object({
            id: z.string().uuid(),
            name: z.string(),
            size: z.number(),
            mimeType: z.string(),
            createdAt: z.string(),
            /** Null while the upload is still waiting for its submission. */
            claimed: z.boolean(),
            url: z.string(),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertFormOwner(input.formId, ctx.user.id);
      const rows = await db
        .select({
          id: formFileUploadsTable.id,
          originalName: formFileUploadsTable.originalName,
          size: formFileUploadsTable.size,
          mimeType: formFileUploadsTable.mimeType,
          createdAt: formFileUploadsTable.createdAt,
          responseId: formFileUploadsTable.responseId,
          storedName: formFileUploadsTable.storedName,
        })
        .from(formFileUploadsTable)
        .where(eq(formFileUploadsTable.formId, input.formId))
        .orderBy(desc(formFileUploadsTable.createdAt))
        .limit(200)
        .execute();

      return {
        uploads: rows.map((row) => ({
          id: row.id,
          name: row.originalName,
          size: row.size,
          mimeType: row.mimeType,
          createdAt: row.createdAt.toISOString(),
          claimed: row.responseId !== null,
          url: signUploadPath(row.storedName),
        })),
      };
    }),
});