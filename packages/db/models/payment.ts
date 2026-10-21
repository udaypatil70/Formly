import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Inbound Razorpay webhook delivery log.
 *
 * Razorpay retries a delivery until it receives a 2xx, and its dashboard can
 * replay an event manually. Every event carries an `X-Razorpay-Event-Id`
 * header, so that id is the natural idempotency key: the unique constraint
 * lets exactly one request claim an event while every replay becomes a cheap
 * no-op.
 *
 * `status` lifecycle:
 *   processing → the claim won and the handler is running
 *   processed  → handler applied the event
 *   ignored    → verified event we do not model (still must not re-run)
 *   failed     → handler threw; a later redelivery may reclaim it
 */
export const razorpayWebhookEventStatusEnum = pgEnum(
  "razorpay_webhook_event_status",
  ["processing", "processed", "ignored", "failed"],
);

export const razorpayWebhookEventsTable = pgTable(
  "razorpay_webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: varchar("event_id", { length: 255 }).notNull().unique(),
    event: varchar("event", { length: 100 }).notNull(),
    status: razorpayWebhookEventStatusEnum("status")
      .default("processing")
      .notNull(),
    /** Original body, kept for audit and manual investigation. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** Number of times a failed/stale claim was retried. */
    attempts: integer("attempts").default(1).notNull(),
    error: text("error"),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
  },
  (table) => [
    index("razorpay_webhook_events_status_idx").on(table.status),
    index("razorpay_webhook_events_received_at_idx").on(table.receivedAt),
  ],
);

export type SelectRazorpayWebhookEvent =
  typeof razorpayWebhookEventsTable.$inferSelect;
export type InsertRazorpayWebhookEvent =
  typeof razorpayWebhookEventsTable.$inferInsert;
