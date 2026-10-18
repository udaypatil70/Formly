import { and, count, db, eq } from "@repo/db";
import { formsTable, usersTable } from "@repo/db/schema";
import { TRPCError } from "@trpc/server";

import { isAdminEmail } from "../../utils/admin";

/**
 * Guards for privileged user mutations.
 *
 * The admin panel is the only place roles and account state change, and a
 * mistake here locks everyone out of the platform, so every mutation is checked
 * against these.
 */

/** Blocks an operator from acting on their own account. */
export function assertNotSelf(actorId: string, targetId: string) {
  if (actorId === targetId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "You cannot perform this action on your own account",
    });
  }
}

/**
 * Refuses to remove the last admin. Counts rows rather than trusting the
 * caller's view, so two concurrent demotions cannot both pass.
 */
export async function assertNotLastAdmin(targetId: string) {
  const [[target], [total]] = await Promise.all([
    db
      .select({ role: usersTable.role, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, targetId))
      .limit(1)
      .execute(),
    db
      .select({ value: count() })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"))
      .execute(),
  ]);

  if (!target) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }
  if (isAdminEmail(target.email)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "This account is an admin via ADMIN_EMAILS. Remove it from the environment list first.",
    });
  }
  if (target.role === "admin" && Number(total?.value ?? 0) <= 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot remove the last remaining admin",
    });
  }
}

/** Blocks suspending/deleting an account that still has published forms. */
export async function assertNoPublishedForms(userId: string) {
  const [row] = await db
    .select({ value: count(formsTable.id) })
    .from(formsTable)
    .where(
      and(
        eq(formsTable.ownerId, userId),
        eq(formsTable.status, "published"),
        eq(formsTable.archived, false),
      ),
    )
    .execute();

  const published = Number(row?.value ?? 0);
  if (published > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `This account owns ${published} published form${published === 1 ? "" : "s"}. Unpublish them first.`,
    });
  }
}
