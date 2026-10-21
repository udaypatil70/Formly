import { and, eq, sql } from "@repo/db";
import { db } from "@repo/db";
import { razorpayWebhookEventsTable } from "@repo/db/schema";

/**
 * Idempotency + retry bookkeeping for Razorpay webhooks.
 *
 * Razorpay delivers at-least-once and exposes a replay button, so handlers must
 * be safe to call twice. The unique `event_id` is claimed with
 * `ON CONFLICT DO NOTHING`; only the request that inserted the row runs the
 * handler. Replays return the stored outcome instead of re-applying it.
 */

const MAX_ATTEMPTS = 5;
const PROCESSING_STALE_MS = 5 * 60_000;

export type RazorpayEventStatus =
  (typeof razorpayWebhookEventsTable.status.enumValues)[number];

export type RazorpayEventClaim =
  | { kind: "claimed"; id: string; attempt: number }
  | { kind: "duplicate"; id: string; status: RazorpayEventStatus };

type ClaimInput = {
  eventId: string;
  event: string;
  payload: Record<string, unknown>;
};

/**
 * Atomically claims an event for processing.
 *
 * A fresh `processing` row means another request is still running: the caller
 * must not process it again. A `failed` row (or a `processing` row that has
 * been abandoned for longer than `PROCESSING_STALE_MS`) is reclaimable, so a
 * crash or transient DB error does not permanently drop the event.
 */
export async function claimRazorpayWebhookEvent(
  input: ClaimInput,
): Promise<RazorpayEventClaim> {
  const [inserted] = await db
    .insert(razorpayWebhookEventsTable)
    .values({
      eventId: input.eventId,
      event: input.event,
      payload: input.payload,
    })
    .onConflictDoNothing({ target: razorpayWebhookEventsTable.eventId })
    .returning({ id: razorpayWebhookEventsTable.id })
    .execute();

  if (inserted) {
    return { kind: "claimed", id: inserted.id, attempt: 1 };
  }

  const [existing] = await db
    .select({
      id: razorpayWebhookEventsTable.id,
      status: razorpayWebhookEventsTable.status,
      attempts: razorpayWebhookEventsTable.attempts,
      receivedAt: razorpayWebhookEventsTable.receivedAt,
    })
    .from(razorpayWebhookEventsTable)
    .where(eq(razorpayWebhookEventsTable.eventId, input.eventId))
    .limit(1)
    .execute();

  if (!existing) {
    // The conflicting row vanished between insert and select (retention sweep).
    // Treat it as a duplicate rather than re-running a possibly applied event.
    return { kind: "duplicate", id: "", status: "failed" };
  }

  const staleBefore = new Date(Date.now() - PROCESSING_STALE_MS);
  const reclaimable =
    existing.status === "failed" ||
    (existing.status === "processing" && existing.receivedAt < staleBefore);

  if (reclaimable && existing.attempts < MAX_ATTEMPTS) {
    const [reclaimed] = await db
      .update(razorpayWebhookEventsTable)
      .set({
        status: "processing",
        attempts: sql`${razorpayWebhookEventsTable.attempts} + 1`,
        error: null,
        processedAt: null,
        receivedAt: new Date(),
      })
      .where(
        and(
          eq(razorpayWebhookEventsTable.id, existing.id),
          eq(razorpayWebhookEventsTable.status, existing.status),
          eq(razorpayWebhookEventsTable.attempts, existing.attempts),
        ),
      )
      .returning({
        id: razorpayWebhookEventsTable.id,
        attempts: razorpayWebhookEventsTable.attempts,
      })
      .execute();

    if (reclaimed) {
      return {
        kind: "claimed",
        id: reclaimed.id,
        attempt: reclaimed.attempts,
      };
    }
  }

  return {
    kind: "duplicate",
    id: existing.id,
    status: existing.status,
  };
}

/** Records the terminal outcome of a claimed event. */
export async function completeRazorpayWebhookEvent(
  id: string,
  outcome: "processed" | "ignored",
): Promise<void> {
  await db
    .update(razorpayWebhookEventsTable)
    .set({
      status: outcome,
      processedAt: new Date(),
      error: null,
    })
    .where(eq(razorpayWebhookEventsTable.id, id))
    .execute();
}

/** Records a handler failure so a later redelivery can reclaim the event. */
export async function failRazorpayWebhookEvent(
  id: string,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";

  await db
    .update(razorpayWebhookEventsTable)
    .set({
      status: "failed",
      error: message.slice(0, 1000),
    })
    .where(eq(razorpayWebhookEventsTable.id, id))
    .execute();
}

/**
 * Whether the stored event is settled. A duplicate of a settled event is safe
 * to acknowledge with 200; an in-flight duplicate must ask Razorpay to retry
 * later instead.
 */
export function isSettledStatus(status: RazorpayEventStatus): boolean {
  return status !== "processing";
}
