import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Lightweight Postgres-backed rate limiter log.
 * Each request appends a row keyed by a hashed identity (e.g. IP);
 * a sliding-window count is used to decide whether a request is allowed.
 */
export const rateLimitLogTable = pgTable(
  "rate_limit_log",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    hitsAt: timestamp("hits_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("rate_limit_log_key_hits_at_idx").on(table.key, table.hitsAt),
    index("rate_limit_log_hits_at_idx").on(table.hitsAt),
  ],
);

export type SelectRateLimitLog = typeof rateLimitLogTable.$inferSelect;
export type InsertRateLimitLog = typeof rateLimitLogTable.$inferInsert;
