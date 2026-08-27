import { db, eq, sql, type SQL } from "@repo/db";
import {
  fieldOptionsTable,
  fieldsTable,
  formsTable,
  themesTable,
  type SelectField,
  type SelectForm,
  type SelectFieldOption,
  type SelectTheme,
} from "@repo/db/schema";
import { TRPCError } from "@trpc/server";
import type { Field, FieldOption } from "@repo/validators";

export type { SelectForm, SelectTheme };

/**
 * Converts a DB field row + its options into the validator `Field` shape
 * expected by `buildResponseSchema`. Strips empty default JSON objects.
 */
export function toValidatorField(
  field: SelectField,
  rawOptions: SelectFieldOption[] = [],
): Field {
  const options: FieldOption[] = rawOptions.map((o) => o);

  const hasKeys = (obj: unknown): obj is Record<string, unknown> =>
    typeof obj === "object" && obj !== null && Object.keys(obj).length > 0;

  return {
    id: field.id,
    formId: field.formId,
    type: field.type,
    label: field.label,
    placeholder: field.placeholder ?? undefined,
    helpText: field.helpText ?? undefined,
    required: field.required,
    order: field.order,
    validationRules: hasKeys(field.validationRules)
      ? field.validationRules
      : undefined,
    conditionalLogic: hasKeys(field.conditionalLogic)
      ? field.conditionalLogic
      : undefined,
    options: options.length > 0 ? options : undefined,
  };
}

export async function getFieldsForForm(formId: string) {
  const fields = await db
    .select()
    .from(fieldsTable)
    .where(eq(fieldsTable.formId, formId))
    .orderBy(fieldsTable.order);

  if (fields.length === 0) {
    return { fields, optionsByField: new Map<string, SelectFieldOption[]>() };
  }

  const options = await db
    .select()
    .from(fieldOptionsTable)
    .where(
      sql`${fieldOptionsTable.fieldId} IN (${fields.map((f) => f.id).join(", ")})`,
    )
    .orderBy(fieldOptionsTable.order);

  const optionsByField = new Map<string, SelectFieldOption[]>();
  for (const option of options) {
    const list = optionsByField.get(option.fieldId) ?? [];
    list.push(option);
    optionsByField.set(option.fieldId, list);
  }

  return { fields, optionsByField };
}

export async function getValidatorFields(formId: string): Promise<Field[]> {
  const { fields, optionsByField } = await getFieldsForForm(formId);
  return fields.map((field) =>
    toValidatorField(field, optionsByField.get(field.id)),
  );
}

/** Fetch a single form row by a where condition (e.g. eq(formsTable.id|slug)). */
export async function getFormBy(
  condition: SQL,
): Promise<SelectForm> {
  const rows = await db.select().from(formsTable).where(condition).limit(1);
  if (rows.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Form not found" });
  }
  return rows[0]!;
}

/** Fetch a form's theme if set. */
export async function getTheme(themeId: string | null): Promise<SelectTheme | null> {
  if (!themeId) return null;
  const themes = await db
    .select()
    .from(themesTable)
    .where(eq(themesTable.id, themeId))
    .limit(1);
  return themes[0] ?? null;
}

/**
 * Loads a form with its validator fields + theme in one shot.
 * Used by the public renderer and the builder editor.
 */
export async function getFormWithEverything(condition: SQL) {
  const form = await getFormBy(condition);
  const fields = await getValidatorFields(form.id);
  const theme = await getTheme(form.themeId);
  return { form, fields, theme };
}