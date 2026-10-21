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
 * Upper bound of every window passed by callers (the 15-minute password
 * budget). The collector below deletes rows older than this, so no caller may
 * use a longer window — anything older is outside every live window.
 */
const MAX_WINDOW_MS = 15 * 60_000;

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
  if (windowMs > MAX_WINDOW_MS) {
    throw new Error(
      `rateLimit window (${windowMs}ms) exceeds MAX_WINDOW_MS (${MAX_WINDOW_MS}ms); raise the collector horizon first`,
    );
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);
  const id = randomUUID();

  // Collect rows older than EVERY live window. Pruning against the caller's
  // own shorter window would let a 60-second limiter wipe the rows of the
  // 15-minute password budget and silently disable it; pruning only rows that
  // no window can still see keeps every budget intact while dead buckets are
  // still collected. Served by the hits_at index.
  await db
    .delete(rateLimitLogTable)
    .where(lt(rateLimitLogTable.hitsAt, new Date(now.getTime() - MAX_WINDOW_MS)))
    .execute();

  await db.insert(rateLimitLogTable).values({ id, key, hitsAt: now }).execute();

  const [row] = await db
    .select({ total: count() })
    .from(rateLimitLogTable)
    .where(and(eq(rateLimitLogTable.key, key), gte(rateLimitLogTable.hitsAt, windowStart)))
    .execute();

  const total = Number(row?.total ?? 0);

  if (total > limit) {
    // Give this slot back so a blocked caller does not lengthen the window.
    await db.delete(rateLimitLogTable).where(eq(rateLimitLogTable.id, id)).execute();

    const [oldest] = await db
      .select({ hitsAt: rateLimitLogTable.hitsAt })
      .from(rateLimitLogTable)
      .where(and(eq(rateLimitLogTable.key, key), gte(rateLimitLogTable.hitsAt, windowStart)))
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
