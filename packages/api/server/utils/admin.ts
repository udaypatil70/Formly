import { db, eq } from "@repo/db";
import { usersTable } from "@repo/db/schema";
import { env } from "@repo/services/env";

/**
 * Admin status has two sources:
 *
 *  1. `users.role`, which persists across deploys and is what the admin panel
 *     writes through `admin.setUserRole`.
 *  2. `ADMIN_EMAILS`, which acts as a bootstrap and an escape hatch. An email
 *     on that list is always an admin, so a locked-out operator can still get
 *     back in by editing the environment.
 *
 * The env list wins when both are present, which means demoting someone who is
 * listed in `ADMIN_EMAILS` has no effect until they are removed from it.
 */

/** True when the email appears in the `ADMIN_EMAILS` env list. */
export function isAdminEmail(email?: string | null): boolean {
  if (!email || !env.ADMIN_EMAILS) return false;
  const allowed = env.ADMIN_EMAILS.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

/**
 * Effective admin role for a session, preferring the persisted column and
 * falling back to the env list.
 *
 * The request context already carries `users.role` via better-auth's additional
 * fields, so this only needs the extra DB read where that isn't available (e.g.
 * admin list rendering before the session is known).
 */
export function isAdminUser(user?: {
  role?: string | null;
  email?: string | null;
}): boolean {
  if (!user) return false;
  return user.role === "admin" || isAdminEmail(user.email);
}

/** Effective admin role for a session, preferring the persisted column and
 * falling back to the env list. */
export function getUserRole(user?: {
  role?: string | null;
  email?: string | null;
}): "admin" | "user" {
  return isAdminUser(user) ? "admin" : "user";
}

/** DB-backed role lookup for a user id. */
export async function resolveUserRole(
  userId: string,
  email?: string | null,
): Promise<"admin" | "user"> {
  if (isAdminEmail(email)) return "admin";
  const [row] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1)
    .execute();
  return row?.role === "admin" ? "admin" : "user";
}
