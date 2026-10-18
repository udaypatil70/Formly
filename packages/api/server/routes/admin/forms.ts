import { z } from "zod";
import {
  and,
  asc,
  count,
  countDistinct,
  db,
  desc,
  eq,
  gte,
  ilike,
  type SQL,
} from "@repo/db";
import {
  formsTable,
  formViewsTable,
  responsesTable,
  themesTable,
  usersTable,
} from "@repo/db/schema";
import { TRPCError } from "@trpc/server";

import { adminProcedure } from "../../trpc";
import {
  TAGS,
  adminFormOutput,
  formIdInput,
  paginationInput,
} from "./schemas";

const listFormsInput = paginationInput.extend({
  search: z.string().max(100).optional(),
  status: z.enum(["draft", "published", "unpublished"]).optional(),
  visibility: z.enum(["public", "unlisted"]).optional(),
  featured: z.boolean().optional(),
  template: z.boolean().optional(),
});

export const adminFormProcedures = {
  /** List every form across all users (searchable + filterable, paginated). */
  listForms: adminProcedure
    .meta({ openapi: { method: "GET", path: "/admin/forms", tags: TAGS } })
    .input(listFormsInput)
    .output(
      z.object({
        forms: z.array(adminFormOutput),
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
      }),
    )
    .query(async ({ input }) => {
      const { page, pageSize } = input;
      const conditions: SQL[] = [];

      if (input.search) {
        conditions.push(ilike(formsTable.title, `%${input.search}%`));
      }
      if (input.status) conditions.push(eq(formsTable.status, input.status));
      if (input.visibility) {
        conditions.push(eq(formsTable.visibility, input.visibility));
      }
      if (input.featured !== undefined) {
        conditions.push(eq(formsTable.isFeatured, input.featured));
      }
      if (input.template !== undefined) {
        conditions.push(eq(formsTable.isTemplate, input.template));
      }

      const where = conditions.length ? and(...conditions) : undefined;
      const rows = await db
        .select({
          form: formsTable,
          ownerName: usersTable.name,
          ownerEmail: usersTable.email,
          responseCount: countDistinct(responsesTable.id),
          viewCount: countDistinct(formViewsTable.id),
        })
        .from(formsTable)
        .innerJoin(usersTable, eq(usersTable.id, formsTable.ownerId))
        .leftJoin(responsesTable, eq(responsesTable.formId, formsTable.id))
        .leftJoin(formViewsTable, eq(formViewsTable.formId, formsTable.id))
        .where(where)
        .groupBy(formsTable.id, usersTable.name, usersTable.email)
        .orderBy(desc(formsTable.isFeatured), desc(formsTable.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute();

      const [totalRow] = await db
        .select({ total: countDistinct(formsTable.id) })
        .from(formsTable)
        .innerJoin(usersTable, eq(usersTable.id, formsTable.ownerId))
        .where(where)
        .execute();

      return {
        forms: rows.map((row) => ({
          id: row.form.id,
          title: row.form.title,
          description: row.form.description,
          slug: row.form.slug,
          status: row.form.status,
          visibility: row.form.visibility,
          archived: row.form.archived,
          isFeatured: row.form.isFeatured,
          isTemplate: row.form.isTemplate,
          templateCategory: row.form.templateCategory,
          customDomain: row.form.customDomain,
          customDomainStatus: row.form.customDomainStatus,
          ownerId: row.form.ownerId,
          ownerName: row.ownerName,
          ownerEmail: row.ownerEmail,
          responseCount: Number(row.responseCount),
          viewCount: Number(row.viewCount),
          createdAt: row.form.createdAt.toISOString(),
          updatedAt: row.form.updatedAt?.toISOString() ?? null,
        })),
        total: Number(totalRow?.total ?? 0),
        page,
        pageSize,
      };
    }),

  /**
   * Toggle whether a form is featured on the Explore page. Works for templates
   * too — `public.getExploreForms` surfaces featured templates regardless of
   * their draft status.
   */
  setFeatured: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: "/admin/forms/{id}/featured",
        tags: TAGS,
      },
    })
    .input(formIdInput.extend({ featured: z.boolean() }))
    .output(z.object({ id: z.string().uuid(), isFeatured: z.boolean() }))
    .mutation(async ({ input }) => {
      const updated = await db
        .update(formsTable)
        .set({ isFeatured: input.featured, updatedAt: new Date() })
        .where(eq(formsTable.id, input.id))
        .returning({ id: formsTable.id, isFeatured: formsTable.isFeatured })
        .execute();

      if (!updated[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Form not found" });
      }
      return updated[0];
    }),

  /**
   * Takes a form offline regardless of who owns it. Used when a form is being
   * abused; the owner's data is left intact so they can fix and republish.
   */
  unpublishForm: adminProcedure
    .meta({
      openapi: { method: "POST", path: "/admin/forms/{id}/unpublish", tags: TAGS },
    })
    .input(formIdInput)
    .output(z.object({ id: z.string().uuid(), status: z.string() }))
    .mutation(async ({ input }) => {
      const updated = await db
        .update(formsTable)
        .set({ status: "unpublished", updatedAt: new Date() })
        .where(eq(formsTable.id, input.id))
        .returning({ id: formsTable.id, status: formsTable.status })
        .execute();

      if (!updated[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Form not found" });
      }
      return updated[0];
    }),

  /** Deletes a form and everything attached to it, whoever owns it. */
  deleteForm: adminProcedure
    .meta({
      openapi: { method: "DELETE", path: "/admin/forms/{id}", tags: TAGS },
    })
    .input(formIdInput)
    .output(z.object({ id: z.string().uuid(), ok: z.boolean() }))
    .mutation(async ({ input }) => {
      const deleted = await db
        .delete(formsTable)
        .where(eq(formsTable.id, input.id))
        .returning({ id: formsTable.id })
        .execute();

      if (!deleted[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Form not found" });
      }
      return { id: deleted[0].id, ok: true };
    }),

  /** Published, non-archived, public forms — the Explore page contents. */
  listExploreForms: adminProcedure
    .meta({ openapi: { method: "GET", path: "/admin/explore", tags: TAGS } })
    .input(paginationInput.extend({ search: z.string().max(100).optional() }))
    .output(
      z.object({
        forms: z.array(
          z.object({
            id: z.string().uuid(),
            title: z.string(),
            slug: z.string(),
            isFeatured: z.boolean(),
            isTemplate: z.boolean(),
            responseCount: z.number(),
          }),
        ),
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
      }),
    )
    .query(async ({ input }) => {
      const { page, pageSize } = input;
      const conditions = [
        eq(formsTable.status, "published"),
        eq(formsTable.archived, false),
        eq(formsTable.visibility, "public"),
      ];
      if (input.search) {
        conditions.push(ilike(formsTable.title, `%${input.search}%`));
      }
      const where = and(...conditions);

      const rows = await db
        .select({
          id: formsTable.id,
          title: formsTable.title,
          slug: formsTable.slug,
          isFeatured: formsTable.isFeatured,
          isTemplate: formsTable.isTemplate,
          responseCount: countDistinct(responsesTable.id),
        })
        .from(formsTable)
        .leftJoin(responsesTable, eq(responsesTable.formId, formsTable.id))
        .where(where)
        .groupBy(formsTable.id)
        .orderBy(desc(formsTable.isFeatured), asc(formsTable.title))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute();

      const [totalRow] = await db
        .select({ total: countDistinct(formsTable.id) })
        .from(formsTable)
        .where(where)
        .execute();

      return {
        forms: rows.map((row) => ({
          ...row,
          responseCount: Number(row.responseCount),
        })),
        total: Number(totalRow?.total ?? 0),
        page,
        pageSize,
      };
    }),

  /** Platform-wide stats: totals, 7-day trend and top forms by responses. */
  getStats: adminProcedure
    .meta({ openapi: { method: "GET", path: "/admin/stats", tags: TAGS } })
    .input(z.undefined())
    .output(
      z.object({
        totalUsers: z.number(),
        totalForms: z.number(),
        publishedForms: z.number(),
        featuredForms: z.number(),
        totalResponses: z.number(),
        totalViews: z.number(),
        totalThemes: z.number(),
        totalTemplates: z.number(),
        pendingDomains: z.number(),
        dailyResponses: z.array(
          z.object({ date: z.string(), count: z.number() }),
        ),
        topForms: z.array(
          z.object({
            id: z.string().uuid(),
            title: z.string(),
            slug: z.string(),
            isFeatured: z.boolean(),
            responseCount: z.number(),
          }),
        ),
      }),
    )
    .query(async () => {
      const countRows = await Promise.all([
        db.select({ count: count() }).from(usersTable).execute(),
        db.select({ count: count() }).from(formsTable).execute(),
        db
          .select({ count: count() })
          .from(formsTable)
          .where(eq(formsTable.status, "published"))
          .execute(),
        db
          .select({ count: count() })
          .from(formsTable)
          .where(eq(formsTable.isFeatured, true))
          .execute(),
        db.select({ count: count() }).from(responsesTable).execute(),
        db.select({ count: count() }).from(formViewsTable).execute(),
        db.select({ count: count() }).from(themesTable).execute(),
        db
          .select({ count: count() })
          .from(formsTable)
          .where(eq(formsTable.isTemplate, true))
          .execute(),
        db
          .select({ count: count() })
          .from(formsTable)
          .where(eq(formsTable.customDomainStatus, "pending"))
          .execute(),
      ]);

      const responseRows = await db
        .select({ submittedAt: responsesTable.submittedAt })
        .from(responsesTable)
        .where(
          gte(responsesTable.submittedAt, new Date(Date.now() - 6 * 86_400_000)),
        )
        .execute();

      const byDay = new Map<string, number>();
      for (const row of responseRows) {
        const bucket = row.submittedAt.toISOString().slice(0, 10);
        byDay.set(bucket, (byDay.get(bucket) ?? 0) + 1);
      }

      const topForms = await db
        .select({
          id: formsTable.id,
          title: formsTable.title,
          slug: formsTable.slug,
          isFeatured: formsTable.isFeatured,
          responseCount: countDistinct(responsesTable.id),
        })
        .from(formsTable)
        .leftJoin(responsesTable, eq(responsesTable.formId, formsTable.id))
        .groupBy(formsTable.id)
        .orderBy(desc(countDistinct(responsesTable.id)))
        .limit(5)
        .execute();

      const days: string[] = [];
      for (let i = 6; i >= 0; i -= 1) {
        days.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
      }

      return {
        totalUsers: Number(countRows[0]?.[0]?.count ?? 0),
        totalForms: Number(countRows[1]?.[0]?.count ?? 0),
        publishedForms: Number(countRows[2]?.[0]?.count ?? 0),
        featuredForms: Number(countRows[3]?.[0]?.count ?? 0),
        totalResponses: Number(countRows[4]?.[0]?.count ?? 0),
        totalViews: Number(countRows[5]?.[0]?.count ?? 0),
        totalThemes: Number(countRows[6]?.[0]?.count ?? 0),
        totalTemplates: Number(countRows[7]?.[0]?.count ?? 0),
        pendingDomains: Number(countRows[8]?.[0]?.count ?? 0),
        dailyResponses: days.map((date) => ({
          date,
          count: byDay.get(date) ?? 0,
        })),
        topForms: topForms.map((row) => ({
          id: row.id,
          title: row.title,
          slug: row.slug,
          isFeatured: row.isFeatured,
          responseCount: Number(row.responseCount),
        })),
      };
    }),
};
