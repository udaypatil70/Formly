import { randomUUID } from "node:crypto";
import { and, db, eq, lt, gte, count } from "@repo/db";
import { rateLimitLogTable } from "@repo/db/schema";

export interface RateLimitOptions {
  /** Max allowed requests within the window per key. */
  limit: number;
  /** Sliding window duration in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  limited: boolean;
  retryAfterMs: number;
}

/**
 * Postgres-backed sliding-window rate limiter backed by `rate_limit_log`.
 *
 * The hit is recorded *before* the window is counted, so the count always
 * includes the current request. A plain count-then-insert check let concurrent
 * requests all observe "under the limit" and sail through; counting our own
 * row closes that window. A rejected request removes its own row again so it
 * never extends the window for everyone else.
 */
export async function rateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);
  const id = randomUUID();

  // Served by rate_limit_log_hits_at_idx, so this stays cheap as the table grows.
  await db
    .delete(rateLimitLogTable)
    .where(lt(rateLimitLogTable.hitsAt, windowStart))
    .execute();

  await db
    .insert(rateLimitLogTable)
    .values({ id, key, hitsAt: now })
    .execute();

  const [row] = await db
    .select({ total: count() })
    .from(rateLimitLogTable)
    .where(
      and(
        eq(rateLimitLogTable.key, key),
        gte(rateLimitLogTable.hitsAt, windowStart),
      ),
    )
    .execute();

  const total = Number(row?.total ?? 0);

  if (total > limit) {
    // Give this slot back so a blocked caller does not lengthen the window.
    await db
      .delete(rateLimitLogTable)
      .where(eq(rateLimitLogTable.id, id))
      .execute();

    const [oldest] = await db
      .select({ hitsAt: rateLimitLogTable.hitsAt })
      .from(rateLimitLogTable)
      .where(
        and(
          eq(rateLimitLogTable.key, key),
          gte(rateLimitLogTable.hitsAt, windowStart),
        ),
      )
      .orderBy(rateLimitLogTable.hitsAt)
      .limit(1)
      .execute();

    // Wait until the oldest hit in the window ages out of it.
    const retryAfterMs = oldest
      ? Math.max(0, oldest.hitsAt.getTime() + windowMs - Date.now())
      : windowMs;

    return { limited: true, retryAfterMs };
  }

  return { limited: false, retryAfterMs: 0 };
}
