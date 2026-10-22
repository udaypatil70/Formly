import { z } from "zod";
import { db, eq, and, asc, or, isNull, count, ilike } from "@repo/db";
import { themesTable } from "@repo/db/schema";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../../trpc";
import {
  themeOutput,
  themeCreateInput,
  themeUpdateInput,
} from "../../utils/schemas";
import { assertThemeQuota, getUserEntitlements } from "../../utils/plans";

const TAGS = ["Themes"];

const themeIdInput = z.object({ id: z.string().uuid() });
const marketplaceThemeOutput = themeOutput.omit({ ownerId: true });

async function assertThemeOwner(themeId: string, userId: string) {
  const rows = await db
    .select({ id: themesTable.id, ownerId: themesTable.ownerId })
    .from(themesTable)
    .where(eq(themesTable.id, themeId))
    .execute();
  const theme = rows[0];
  if (!theme) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Theme not found" });
  }
  if (theme.ownerId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only manage your own themes",
    });
  }
  return theme;
}

export const themeRouter = router({
  /** List predefined themes plus the caller's custom ones. */
  getAll: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/themes", tags: TAGS } })
    .input(z.undefined())
    .output(z.array(themeOutput))
    .query(async ({ ctx }) => {
      const themes = await db
        .select()
        .from(themesTable)
        .where(
          and(
            or(
              eq(themesTable.ownerId, ctx.user.id),
              isNull(themesTable.ownerId),
              eq(themesTable.isPublic, true),
            ),
          ),
        )
        .orderBy(asc(themesTable.name))
        .execute();
      return themes;
    }),

  getMarketplace: publicProcedure
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
        search: z.string().trim().max(100).optional(),
        category: z
          .enum([
            "movies",
            "anime",
            "games",
            "startups",
            "tech",
            "os",
            "events",
            "community",
          ])
          .optional(),
      }),
    )
    .output(
      z.object({
        themes: z.array(marketplaceThemeOutput),
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
      }),
    )
    .query(async ({ input }) => {
      const conditions = [
        or(isNull(themesTable.ownerId), eq(themesTable.isPublic, true))!,
      ];
      if (input.search) {
        conditions.push(ilike(themesTable.name, `%${input.search}%`));
      }
      if (input.category) {
        conditions.push(eq(themesTable.category, input.category));
      }
      const where = and(...conditions);
      const [themes, totalRow] = await Promise.all([
        db
          .select()
          .from(themesTable)
          .where(where)
          .orderBy(asc(themesTable.name))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize)
          .execute(),
        db.select({ total: count() }).from(themesTable).where(where).execute(),
      ]);
      return {
        themes: themes.map(({ ownerId: _ownerId, ...theme }) => theme),
        total: Number(totalRow[0]?.total ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  duplicate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(themeOutput)
    .mutation(async ({ ctx, input }) => {
      const [source] = await db
        .select()
        .from(themesTable)
        .where(eq(themesTable.id, input.id))
        .limit(1)
        .execute();
      if (!source) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Theme not found" });
      }
      if (source.ownerId && source.ownerId !== ctx.user.id && !source.isPublic) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This theme is not shared",
        });
      }
      const { entitlements } = await getUserEntitlements(ctx.user.id);
      await assertThemeQuota(ctx.user.id, entitlements);
      const [copy] = await db
        .insert(themesTable)
        .values({
          ownerId: ctx.user.id,
          isPublic: false,
          name: `Copy of ${source.name}`.slice(0, 100),
          category: source.category,
          font: source.font,
          colors: source.colors,
          background: source.background,
        })
        .returning()
        .execute();
      return copy!;
    }),

  share: protectedProcedure
    .input(z.object({ id: z.string().uuid(), isPublic: z.boolean() }))
    .output(themeOutput)
    .mutation(async ({ ctx, input }) => {
      await assertThemeOwner(input.id, ctx.user.id);
      const [updated] = await db
        .update(themesTable)
        .set({ isPublic: input.isPublic })
        .where(eq(themesTable.id, input.id))
        .returning()
        .execute();
      return updated!;
    }),

  /** Create a custom theme owned by the caller. */
  create: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/themes", tags: TAGS } })
    .input(themeCreateInput)
    .output(themeOutput)
    .mutation(async ({ ctx, input }) => {
      const { entitlements } = await getUserEntitlements(ctx.user.id);
      await assertThemeQuota(ctx.user.id, entitlements);
      const created = await db
        .insert(themesTable)
        .values({ ...input, ownerId: ctx.user.id })
        .returning()
        .execute();
      return created[0]!;
    }),

  /** Update a custom theme owned by the caller. */
  update: protectedProcedure
    .meta({ openapi: { method: "PATCH", path: "/themes/{id}", tags: TAGS } })
    .input(themeUpdateInput)
    .output(themeOutput)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await assertThemeOwner(id, ctx.user.id);
      const updated = await db
        .update(themesTable)
        .set(data)
        .where(eq(themesTable.id, id))
        .returning()
        .execute();
      return updated[0]!;
    }),

  /** Delete a custom theme owned by the caller. */
  delete: protectedProcedure
    .meta({ openapi: { method: "DELETE", path: "/themes/{id}", tags: TAGS } })
    .input(themeIdInput)
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertThemeOwner(input.id, ctx.user.id);
      await db
        .delete(themesTable)
        .where(eq(themesTable.id, input.id))
        .execute();
      return { ok: true };
    }),
});