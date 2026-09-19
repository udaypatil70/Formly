import { z } from "zod";
import {
  db,
  eq,
  and,
  or,
  desc,
  asc,
  count,
  countDistinct,
  ilike,
  gte,
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
import { router, adminProcedure } from "../../trpc";
import { isAdminEmail } from "../../utils/admin";

const TAGS = ["Admin"];

const paginationInput = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

const toDayBucket = (date: Date) => date.toISOString().slice(0, 10);

/** Ordered list of the last 7 day buckets (oldest → today). */
function last7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    days.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
  }
  return days;
}

const adminUserOutput = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean().nullable(),
  createdAt: z.string().nullable(),
  role: z.enum(["admin", "user"]),
  plan: z.enum(["free", "pro", "enterprise"]).default("free"),
  formCount: z.number(),
});

const adminFormOutput = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  slug: z.string(),
  status: z.enum(["draft", "published", "unpublished"]),
  visibility: z.enum(["public", "unlisted"]),
  archived: z.boolean(),
  isFeatured: z.boolean(),
  ownerId: z.string().uuid(),
  ownerName: z.string(),
  ownerEmail: z.string(),
  responseCount: z.number(),
  viewCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
});

export const adminRouter = router({
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
        const bucket = toDayBucket(row.submittedAt);
        byDay.set(bucket, (byDay.get(bucket) ?? 0) + 1);
      }

      const topFormRows = await db
        .select({
          id: formsTable.id,
          title: formsTable.title,
          slug: formsTable.slug,
          isFeatured: formsTable.isFeatured,
          responseCount: count(responsesTable.id),
        })
        .from(formsTable)
        .leftJoin(responsesTable, eq(responsesTable.formId, formsTable.id))
        .groupBy(formsTable.id)
        .orderBy(desc(count(responsesTable.id)))
        .limit(5)
        .execute();

      return {
        totalUsers: Number(countRows[0]?.[0]?.count ?? 0),
        totalForms: Number(countRows[1]?.[0]?.count ?? 0),
        publishedForms: Number(countRows[2]?.[0]?.count ?? 0),
        featuredForms: Number(countRows[3]?.[0]?.count ?? 0),
        totalResponses: Number(countRows[4]?.[0]?.count ?? 0),
        totalViews: Number(countRows[5]?.[0]?.count ?? 0),
        totalThemes: Number(countRows[6]?.[0]?.count ?? 0),
        dailyResponses: last7Days().map((date) => ({
          date,
          count: byDay.get(date) ?? 0,
        })),
        topForms: topFormRows.map((row) => ({
          id: row.id,
          title: row.title,
          slug: row.slug,
          isFeatured: row.isFeatured,
          responseCount: Number(row.responseCount),
        })),
      };
    }),

  /** List all users with their form counts (searchable, paginated). */
  listUsers: adminProcedure
    .meta({ openapi: { method: "GET", path: "/admin/users", tags: TAGS } })
    .input(
      paginationInput.extend({
        search: z.string().max(100).optional(),
      }),
    )
    .output(
      z.object({
        users: z.array(adminUserOutput),
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
      }),
    )
    .query(async ({ input }) => {
      const { page, pageSize } = input;

      const conditions: SQL[] = [];
      if (input.search) {
        const search = `%${input.search}%`;
        conditions.push(
          or(ilike(usersTable.name, search), ilike(usersTable.email, search))!,
        );
      }

      const rows = await db
        .select({
          user: usersTable,
          formCount: count(formsTable.id),
        })
        .from(usersTable)
        .leftJoin(formsTable, eq(formsTable.ownerId, usersTable.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .groupBy(usersTable.id)
        .orderBy(desc(usersTable.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute();

      const [totalRow] = await db
        .select({ total: count() })
        .from(usersTable)
        .where(conditions.length ? and(...conditions) : undefined)
        .execute();

      return {
        users: rows.map((row) => ({
          id: row.user.id,
          name: row.user.name,
          email: row.user.email,
          emailVerified: row.user.emailVerified,
          createdAt: row.user.createdAt?.toISOString() ?? null,
          role: isAdminEmail(row.user.email) ? "admin" : "user",
          plan: row.user.plan ?? "free",
          formCount: Number(row.formCount),
        })),
        total: Number(totalRow?.total ?? 0),
        page,
        pageSize,
      };
    }),

  /** List every form across all users (searchable + filterable, paginated). */
  listForms: adminProcedure
    .meta({ openapi: { method: "GET", path: "/admin/forms", tags: TAGS } })
    .input(
      paginationInput.extend({
        search: z.string().max(100).optional(),
        status: z.enum(["draft", "published", "unpublished"]).optional(),
        visibility: z.enum(["public", "unlisted"]).optional(),
        featured: z.boolean().optional(),
      }),
    )
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
      if (input.status) {
        conditions.push(eq(formsTable.status, input.status));
      }
      if (input.visibility) {
        conditions.push(eq(formsTable.visibility, input.visibility));
      }
      if (input.featured !== undefined) {
        conditions.push(eq(formsTable.isFeatured, input.featured));
      }

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
        .where(conditions.length ? and(...conditions) : undefined)
        .groupBy(formsTable.id, usersTable.name, usersTable.email)
        .orderBy(desc(formsTable.isFeatured), desc(formsTable.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute();

      const [totalRow] = await db
        .select({ total: count() })
        .from(formsTable)
        .where(conditions.length ? and(...conditions) : undefined)
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

  /** Toggle whether a form is featured on the Explore page. */
  setFeatured: adminProcedure
    .meta({ openapi: { method: "PATCH", path: "/admin/forms/{id}/featured", tags: TAGS } })
    .input(z.object({ id: z.string().uuid(), featured: z.boolean() }))
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

  /** All published, non-archived public forms (helper for the Explore page). */
  listExploreForms: adminProcedure
    .meta({ openapi: { method: "GET", path: "/admin/explore", tags: TAGS } })
    .input(
      paginationInput.extend({
        search: z.string().max(100).optional(),
      }),
    )
    .output(
      z.object({
        forms: z.array(
          z.object({
            id: z.string().uuid(),
            title: z.string(),
            slug: z.string(),
            isFeatured: z.boolean(),
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

      const rows = await db
        .select({
          id: formsTable.id,
          title: formsTable.title,
          slug: formsTable.slug,
          isFeatured: formsTable.isFeatured,
          responseCount: count(responsesTable.id),
        })
        .from(formsTable)
        .leftJoin(responsesTable, eq(responsesTable.formId, formsTable.id))
        .where(and(...conditions))
        .groupBy(formsTable.id)
        .orderBy(desc(formsTable.isFeatured), asc(formsTable.title))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute();

      const [totalRow] = await db
        .select({ total: count() })
        .from(formsTable)
        .where(and(...conditions))
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
});