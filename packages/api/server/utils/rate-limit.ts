/**
 * Minimal in-memory sliding-window rate limiter.
 * Good enough for a single-process server and demo loads.
 */
const buckets = new Map<string, { timestamps: number[]; windowMs: number; limit: number }>();

export function rateLimit(key: string, options: { limit: number; windowMs: number }) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.limit !== options.limit || bucket.windowMs !== options.windowMs) {
    buckets.set(key, {
      timestamps: [now],
      windowMs: options.windowMs,
      limit: options.limit,
    });
    return { limited: false, retryAfterMs: 0 };
  }

  const active = bucket.timestamps.filter((t) => now - t < bucket.windowMs);

  if (active.length >= bucket.limit) {
    bucket.timestamps = active;
    return { limited: true, retryAfterMs: bucket.windowMs - (now - active[0]!) };
  }

  active.push(now);
  bucket.timestamps = active;
  return { limited: false, retryAfterMs: 0 };
}