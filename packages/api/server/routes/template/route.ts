import { z } from "zod";
import { db, eq, and, desc, count, inArray, ilike } from "@repo/db";
import { fieldsTable, formsTable, themesTable } from "@repo/db/schema";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../../trpc";
import { getFieldsForForm } from "../../utils/form";
import { ensureUniqueSlug } from "../../utils/slug";
import { serializeForm, serializeTheme } from "../../utils/serialize";
import { fieldOutput, formMetaOutput, themeOutput } from "../../utils/schemas";
import { insertFields, type DB } from "../form/route";

const TAGS = ["Templates"];

const idInput = z.object({ id: z.string().uuid() });

const templateListInput = z.object({
  search: z.string().max(100).optional(),
  category: z.string().max(50).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

const templateMetaOutput = formMetaOutput.extend({
  templateCategory: z.string().nullable().optional(),
  fieldCount: z.number(),
  themeName: z.string().nullable().optional(),
  colors: z
    .object({
      primary: z.string(),
      background: z.string(),
      surface: z.string(),
      text: z.string(),
    })
    .nullable()
    .optional(),
});

const templateDetailOutput = z.object({
  form: templateMetaOutput,
  fields: z.array(fieldOutput),
  theme: themeOutput.nullable(),
});

export const templateRouter = router({
  /** List available templates (public, searchable by title + category). */
  listAll: publicProcedure
    .meta({
      openapi: { method: "GET", path: "/templates", tags: TAGS },
    })
    .input(templateListInput)
    .output(
      z.object({
        templates: z.array(templateMetaOutput),
        total: z.number(),
      }),
    )
    .query(async ({ input }) => {
      const conditions = [eq(formsTable.isTemplate, true)];
      if (input.search) {
        const search = `%${input.search}%`;
        conditions.push(ilike(formsTable.title, search));
      }
      if (input.category) {
        conditions.push(eq(formsTable.templateCategory, input.category));
      }

      const rows = await db
        .select({
          form: formsTable,
          themeName: themesTable.name,
          themeCategory: themesTable.category,
          themeColors: themesTable.colors,
        })
        .from(formsTable)
        .leftJoin(themesTable, eq(themesTable.id, formsTable.themeId))
        .where(and(...conditions))
        .orderBy(desc(formsTable.createdAt))
        .limit(input.limit)
        .execute();

      const ids = rows.map((r) => r.form.id);
      const fieldCounts = new Map<string, number>();
      if (ids.length > 0) {
        const counts = await db
          .select({ formId: fieldsTable.formId, count: count() })
          .from(fieldsTable)
          .where(inArray(fieldsTable.formId, ids))
          .groupBy(fieldsTable.formId)
          .execute();
        for (const c of counts) {
          fieldCounts.set(c.formId, Number(c.count));
        }
      }

      const [totalRow] = await db
        .select({ total: count() })
        .from(formsTable)
        .where(and(...conditions))
        .execute();

      return {
        templates: rows.map((row) => ({
          ...serializeForm(row.form),
          templateCategory: row.form.templateCategory ?? null,
          fieldCount: fieldCounts.get(row.form.id) ?? 0,
          themeName: row.themeName ?? null,
          colors: row.themeColors ?? null,
        })),
        total: Number(totalRow?.total ?? 0),
      };
    }),

  /** Fetch a single template with its fields for preview. */
  getById: publicProcedure
    .meta({
      openapi: { method: "GET", path: "/templates/{id}", tags: TAGS },
    })
    .input(idInput)
    .output(templateDetailOutput)
    .query(async ({ input }) => {
      const rows = await db
        .select({ form: formsTable })
        .from(formsTable)
        .where(
          and(eq(formsTable.id, input.id), eq(formsTable.isTemplate, true)),
        )
        .limit(1)
        .execute();
      const template = rows[0]?.form;
      if (!template) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      }

      const { fields, optionsByField } = await getFieldsForForm(template.id);
      const themes = template.themeId
        ? await db
            .select()
            .from(themesTable)
            .where(eq(themesTable.id, template.themeId))
            .limit(1)
            .execute()
        : [];

      return {
        form: {
          ...serializeForm(template),
          templateCategory: template.templateCategory ?? null,
          fieldCount: fields.length,
          themeName: themes[0]?.name ?? null,
          colors: themes[0]?.colors ?? null,
        },
        fields: fields.map((field) => ({
          ...field,
          type: field.type as z.infer<typeof fieldOutput>["type"],
          options:
            optionsByField.get(field.id)?.map((o) => ({
              id: o.id,
              label: o.label,
              value: o.value,
              order: o.order,
            })) ?? [],
        })) as unknown as z.infer<typeof templateDetailOutput>["fields"],
        theme: serializeTheme(themes[0] ?? null),
      };
    }),

  /** Create a new draft form from a template, owned by the current user. */
  useTemplate: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/templates/{id}/use",
        tags: TAGS,
      },
    })
    .input(idInput)
    .output(formMetaOutput)
    .mutation(async ({ ctx, input }) => {
      const rows = await db
        .select({ form: formsTable })
        .from(formsTable)
        .where(
          and(eq(formsTable.id, input.id), eq(formsTable.isTemplate, true)),
        )
        .limit(1)
        .execute();
      const template = rows[0]?.form;
      if (!template) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      }

      const settings = template.settings ?? {};
      const {
        password: _password,
        expiry: _expiry,
        responseLimit: _responseLimit,
        notificationEmail: _notificationEmail,
        sendConfirmation: _sendConfirmation,
        confirmationEmailFieldId: _confirmationEmailFieldId,
        ...safeSettings
      } = settings;

      return db.transaction(async (tx) => {
        const newSlug = await ensureUniqueSlug(template.slug);
        const inserted = await tx
          .insert(formsTable)
          .values({
            ownerId: ctx.user.id,
            title: template.title,
            description: template.description,
            slug: newSlug,
            status: "draft",
            visibility: "public",
            archived: false,
            themeId: template.themeId,
            settings: safeSettings,
          })
          .returning()
          .execute();

        const created = inserted[0]!;

        const { fields, optionsByField } = await getFieldsForForm(template.id);
        await insertFields(tx as DB, created.id, [
          ...fields.map((field) => ({
            type: field.type,
            label: field.label,
            placeholder: field.placeholder ?? undefined,
            helpText: field.helpText ?? undefined,
            required: field.required,
            order: field.order,
            validationRules: field.validationRules ?? undefined,
            conditionalLogic: field.conditionalLogic ?? undefined,
            options: optionsByField.get(field.id)?.map((o) => ({
              label: o.label,
              value: o.value,
              order: o.order,
            })),
          })),
        ]);

        return serializeForm(created);
      });
    }),
});