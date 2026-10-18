import { TRPCError } from "@trpc/server";
import {
  fieldOptionsTable,
  fieldsTable,
  formsTable,
} from "@repo/db/schema";
import { db, eq } from "@repo/db";
import type { CreateFieldInput, Field } from "@repo/validators";
import type { FormVersionField } from "@repo/db/schema";

import { getFormBy } from "../../utils/form";

/**
 * Helpers shared by the form router and its sub-modules (versions, domains).
 * Kept in their own file so those modules can import them without creating a
 * cycle back through `route.ts`.
 */

/** The transaction object type handed to `db.transaction(cb)`. */
type DB =
  Parameters<typeof db.transaction>[0] extends (tx: infer T) => unknown
    ? T
    : never;

export type { DB };

/** Insert fields + their options inside a transaction. */
export async function insertFields(
  tx: DB,
  formId: string,
  fields: CreateFieldInput[],
) {
  for (const field of fields) {
    const inserted = await tx
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

    const created = inserted[0]!;

    if (field.options && field.options.length > 0) {
      await tx
        .insert(fieldOptionsTable)
        .values(
          field.options.map((option) => ({
            fieldId: created.id,
            label: option.label,
            value: option.value,
            order: option.order,
          })),
        )
        .execute();
    }
  }
}

/** Throws FORBIDDEN when the form isn't owned by the current user. */
export async function assertFormOwner(formId: string, userId: string) {
  const form = await getFormBy(eq(formsTable.id, formId));
  if (form.ownerId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this form",
    });
  }
  return form;
}

/** Snapshot shape: validator Field -> JSON form version field. */
export function toVersionField(field: Field): FormVersionField {
  return {
    id: field.id,
    type: field.type,
    label: field.label,
    placeholder: field.placeholder ?? null,
    helpText: field.helpText ?? null,
    required: field.required,
    order: field.order,
    validationRules: field.validationRules ?? null,
    conditionalLogic: field.conditionalLogic ?? null,
    options:
      field.options?.map((o) => ({ label: o.label, value: o.value, order: o.order })) ??
      null,
  };
}
