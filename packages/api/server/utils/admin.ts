import { env } from "@repo/services/env";

/**
 * Admin status is derived at request time from the ADMIN_EMAILS env list
 * (comma-separated). Adding an email to the list grants admin access; removing
 * it revokes access immediately. No per-row role column to keep in sync.
 */
export function isAdminEmail(email?: string | null): boolean {
  if (!email || !env.ADMIN_EMAILS) return false;
  const allowed = env.ADMIN_EMAILS.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export function getUserRole(email?: string | null): "admin" | "user" {
  return isAdminEmail(email) ? "admin" : "user";
}