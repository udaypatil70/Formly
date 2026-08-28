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
 * Each request appends a row keyed by `key`; the request is allowed only if
 * the number of rows within the window stays at or below `limit`.
 * Stale rows are pruned opportunistically on each call.
 */
export async function rateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  await db
    .delete(rateLimitLogTable)
    .where(lt(rateLimitLogTable.hitsAt, windowStart))
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

  if (total >= limit) {
    return { limited: true, retryAfterMs: windowMs };
  }

  await db
    .insert(rateLimitLogTable)
    .values({ id: randomUUID(), key, hitsAt: now })
    .execute();

  return { limited: false, retryAfterMs: 0 };
}
