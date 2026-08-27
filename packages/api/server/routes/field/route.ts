import { z } from "zod";
import { db, eq } from "@repo/db";
import {
  fieldOptionsTable,
  fieldsTable,
  formsTable,
} from "@repo/db/schema";
import { TRPCError } from "@trpc/server";
import {
  CreateFieldInput,
  UpdateFieldInput,
} from "@repo/validators";
import { router, protectedProcedure } from "../../trpc";
import { getFormBy } from "../../utils/form";
import { assertFormOwner } from "../form/route";
import { fieldOutput } from "../../utils/schemas";

const TAGS = ["Fields"];

const addInput = z.object({
  formId: z.string().uuid(),
  ...CreateFieldInput.shape,
});

const deleteInput = z.object({ id: z.string().uuid() });

const reorderInput = z.object({
  formId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1),
});

export const fieldRouter = router({
  /** Add a new field to a form. */
  add: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/fields", tags: TAGS } })
    .input(addInput)
    .output(fieldOutput)
    .mutation(async ({ ctx, input }) => {
      const { formId, ...field } = input;
      await assertFormOwner(formId, ctx.user.id);

      const inserted = await db.transaction(async (tx) => {
        const created = await tx
          .insert(fieldsTable)
          .values({
            formId,
            type: field.type,
            label: field.label,
            placeholder: field.placeholder ?? null,
            helpText: field.helpText ?? null,
            required: field.required ?? false,
            order: field.order,
            validationRules: field.validationRules ?? {},
            conditionalLogic: field.conditionalLogic ?? {},
          })
          .returning()
          .execute();

        const row = created[0]!;

        if (field.options && field.options.length > 0) {
          await tx
            .insert(fieldOptionsTable)
            .values(
              field.options.map((option) => ({
                fieldId: row.id,
                label: option.label,
                value: option.value,
                order: option.order,
              })),
            )
            .execute();
        }
        return row;
      });

      const options = await db
        .select()
        .from(fieldOptionsTable)
        .where(eq(fieldOptionsTable.fieldId, inserted.id))
        .orderBy(fieldOptionsTable.order)
        .execute();

      return { ...inserted, options: options.length ? options : undefined };
    }),

  /** Update a field (and replace its options when provided). */
  update: protectedProcedure
    .meta({ openapi: { method: "PATCH", path: "/fields/{id}", tags: TAGS } })
    .input(UpdateFieldInput)
    .output(fieldOutput)
    .mutation(async ({ ctx, input }) => {
      const current = await db
        .select()
        .from(fieldsTable)
        .where(eq(fieldsTable.id, input.id))
        .limit(1)
        .execute();

      if (current.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Field not found" });
      }
      const fieldRow = current[0]!;
      const form = await getFormBy(eq(formsTable.id, fieldRow.formId));
      if (form.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your form" });
      }

      const updated = await db.transaction(async (tx) => {
        const result = await tx
          .update(fieldsTable)
          .set({
            type: input.type ?? fieldRow.type,
            label: input.label ?? fieldRow.label,
            placeholder:
              input.placeholder !== undefined
                ? input.placeholder
                : fieldRow.placeholder,
            helpText:
              input.helpText !== undefined ? input.helpText : fieldRow.helpText,
            required: input.required ?? fieldRow.required,
            order: input.order ?? fieldRow.order,
            validationRules:
              input.validationRules !== undefined
                ? (input.validationRules ?? {})
                : fieldRow.validationRules,
            conditionalLogic:
              input.conditionalLogic !== undefined
                ? (input.conditionalLogic ?? {})
                : fieldRow.conditionalLogic,
          })
          .where(eq(fieldsTable.id, input.id))
          .returning()
          .execute();

        const row = result[0]!;

        if (input.options) {
          await tx
            .delete(fieldOptionsTable)
            .where(eq(fieldOptionsTable.fieldId, input.id))
            .execute();
          await tx
            .insert(fieldOptionsTable)
            .values(
              input.options.map((option) => ({
                fieldId: row.id,
                label: option.label,
                value: option.value,
                order: option.order,
              })),
            )
            .execute();
        }

        return row;
      });

      const options = await db
        .select()
        .from(fieldOptionsTable)
        .where(eq(fieldOptionsTable.fieldId, updated.id))
        .orderBy(fieldOptionsTable.order)
        .execute();

      return { ...updated, options: options.length ? options : undefined };
    }),

  /** Delete a field (cascades its options). */
  delete: protectedProcedure
    .meta({ openapi: { method: "DELETE", path: "/fields/{id}", tags: TAGS } })
    .input(deleteInput)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const current = await db
        .select()
        .from(fieldsTable)
        .where(eq(fieldsTable.id, input.id))
        .limit(1)
        .execute();
      if (current.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Field not found" });
      }
      const form = await getFormBy(eq(formsTable.id, current[0]!.formId));
      if (form.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your form" });
      }
      await db.delete(fieldsTable).where(eq(fieldsTable.id, input.id)).execute();
      return { success: true };
    }),

  /** Batch reorder fields (for drag-and-drop in the builder). */
  reorder: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/fields/reorder", tags: TAGS } })
    .input(reorderInput)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const form = await assertFormOwner(input.formId, ctx.user.id);

      await db.transaction(async (tx) => {
        for (let index = 0; index < input.orderedIds.length; index++) {
          await tx
            .update(fieldsTable)
            .set({ order: index })
            .where(eq(fieldsTable.id, input.orderedIds[index]!))
            .execute();
        }
      });

      return { success: true };
    }),
});