import { z } from "zod";
import { and, count, db, desc, eq, ilike, type SQL } from "@repo/db";
import { fieldsTable, formsTable, usersTable } from "@repo/db/schema";
import { TemplateCategory } from "@repo/validators";
import { TRPCError } from "@trpc/server";

import { adminProcedure } from "../../trpc";
import { ensureUniqueSlug } from "../../utils/slug";
import { serializeForm } from "../../utils/serialize";
import { formMetaOutput } from "../../utils/schemas";
import {
  TAGS,
  adminTemplateOutput,
  formIdInput,
  paginationInput,
} from "./schemas";

const createTemplateInput = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  category: TemplateCategory.optional(),
});

const updateTemplateInput = formIdInput.extend({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  category: TemplateCategory.nullable().optional(),
  status: z.enum(["draft", "published", "unpublished"]).optional(),
});

export const adminTemplateProcedures = {
  /** List templates, including drafts that never appear in the catalogue. */
  listTemplates: adminProcedure
    .meta({ openapi: { method: "GET", path: "/admin/templates", tags: TAGS } })
    .input(
      paginationInput.extend({
        search: z.string().max(100).optional(),
        category: TemplateCategory.optional(),
      }),
    )
    .output(
      z.object({
        templates: z.array(adminTemplateOutput),
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
      }),
    )
    .query(async ({ input }) => {
      const { page, pageSize } = input;
      const conditions: SQL[] = [eq(formsTable.isTemplate, true)];

      if (input.search) {
        conditions.push(ilike(formsTable.title, `%${input.search}%`));
      }
      if (input.category) {
        conditions.push(eq(formsTable.templateCategory, input.category));
      }
      const where = and(...conditions);

      const rows = await db
        .select({
          form: formsTable,
          ownerName: usersTable.name,
          ownerEmail: usersTable.email,
          fieldCount: count(fieldsTable.id),
          responseCount: count(formsTable.id),
        })
        .from(formsTable)
        .innerJoin(usersTable, eq(usersTable.id, formsTable.ownerId))
        .leftJoin(fieldsTable, eq(fieldsTable.formId, formsTable.id))
        .where(where)
        .groupBy(formsTable.id, usersTable.name, usersTable.email)
        .orderBy(desc(formsTable.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute();

      const [totalRow] = await db
        .select({ total: count() })
        .from(formsTable)
        .where(where)
        .execute();

      return {
        templates: rows.map((row) => ({
          id: row.form.id,
          title: row.form.title,
          description: row.form.description,
          slug: row.form.slug,
          status: row.form.status,
          templateCategory: row.form.templateCategory,
          isFeatured: row.form.isFeatured,
          fieldCount: Number(row.fieldCount),
          responseCount: 0,
          ownerId: row.form.ownerId,
          ownerName: row.ownerName,
          ownerEmail: row.ownerEmail,
          createdAt: row.form.createdAt.toISOString(),
          updatedAt: row.form.updatedAt?.toISOString() ?? null,
        })),
        total: Number(totalRow?.total ?? 0),
        page,
        pageSize,
      };
    }),

  /**
   * Creates an empty template. Templates are ordinary form rows with
   * `is_template = true`, so they can be instantiated through the same
   * `template.useTemplate` path a seeded template uses.
   */
  createTemplate: adminProcedure
    .meta({ openapi: { method: "POST", path: "/admin/templates", tags: TAGS } })
    .input(createTemplateInput)
    .output(formMetaOutput)
    .mutation(async ({ ctx, input }) => {
      const inserted = await db
        .insert(formsTable)
        .values({
          ownerId: ctx.user.id,
          title: input.title,
          description: input.description ?? null,
          slug: await ensureUniqueSlug(input.title),
          status: "draft",
          visibility: "public",
          isTemplate: true,
          templateCategory: input.category ?? null,
          settings: {},
        })
        .returning()
        .execute();

      return serializeForm(inserted[0]!);
    }),

  /** Edits a template's copy, category or publication state. */
  updateTemplate: adminProcedure
    .meta({
      openapi: { method: "PATCH", path: "/admin/templates/{id}", tags: TAGS },
    })
    .input(updateTemplateInput)
    .output(formMetaOutput)
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updated = await db
        .update(formsTable)
        .set({
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.description !== undefined
            ? { description: data.description }
            : {}),
          ...(data.category !== undefined
            ? { templateCategory: data.category }
            : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
        })
        .where(
          and(eq(formsTable.id, id), eq(formsTable.isTemplate, true)),
        )
        .returning()
        .execute();

      if (!updated[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      }
      return serializeForm(updated[0]);
    }),

  /** Deletes a template. Refused while any form was instantiated from it. */
  deleteTemplate: adminProcedure
    .meta({
      openapi: { method: "DELETE", path: "/admin/templates/{id}", tags: TAGS },
    })
    .input(formIdInput)
    .output(z.object({ id: z.string().uuid(), ok: z.boolean() }))
    .mutation(async ({ input }) => {
      const deleted = await db
        .delete(formsTable)
        .where(
          and(eq(formsTable.id, input.id), eq(formsTable.isTemplate, true)),
        )
        .returning({ id: formsTable.id })
        .execute();

      if (!deleted[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      }
      return { id: deleted[0].id, ok: true };
    }),
};
