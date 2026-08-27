import { db, eq } from "@repo/db";
import { formsTable } from "@repo/db/schema";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 255);
}

/** Ensures a slug is unique by appending -2, -3, ... when taken. */
export async function ensureUniqueSlug(slug: string): Promise<string> {
  const exists = async (candidate: string) => {
    const rows = await db
      .select({ id: formsTable.id })
      .from(formsTable)
      .where(eq(formsTable.slug, candidate))
      .limit(1);
    return rows.length > 0;
  };

  if (!(await exists(slug))) return slug;

  let index = 2;
  while (await exists(`${slug}-${index}`)) {
    index++;
  }
  return `${slug}-${index}`;
}

/** Slug availability check for the builder UX. */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  const rows = await db
    .select({ id: formsTable.id })
    .from(formsTable)
    .where(eq(formsTable.slug, slug))
    .limit(1);
  return rows.length === 0;
}