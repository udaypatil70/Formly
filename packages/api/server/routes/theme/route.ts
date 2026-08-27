import { z } from "zod";
import { db, eq, asc } from "@repo/db";
import { themesTable } from "@repo/db/schema";
import { router, publicProcedure } from "../../trpc";
import { themeOutput } from "../../utils/schemas";

const TAGS = ["Themes"];

export const themeRouter = router({
  /** List all available themes for the builder's theme picker. */
  getAll: publicProcedure
    .meta({ openapi: { method: "GET", path: "/themes", tags: TAGS } })
    .input(z.undefined())
    .output(z.array(themeOutput))
    .query(async () => {
      const themes = await db
        .select()
        .from(themesTable)
        .orderBy(asc(themesTable.name))
        .execute();
      return themes;
    }),
});