import { z } from "zod";
import { db, eq, and, asc, or, isNull } from "@repo/db";
import { themesTable } from "@repo/db/schema";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../trpc";
import {
  themeOutput,
  themeCreateInput,
  themeUpdateInput,
} from "../../utils/schemas";

const TAGS = ["Themes"];

const themeIdInput = z.object({ id: z.string().uuid() });

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
            ),
          ),
        )
        .orderBy(asc(themesTable.name))
        .execute();
      return themes;
    }),

  /** Create a custom theme owned by the caller. */
  create: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/themes", tags: TAGS } })
    .input(themeCreateInput)
    .output(themeOutput)
    .mutation(async ({ ctx, input }) => {
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