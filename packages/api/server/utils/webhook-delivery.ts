import { createHmac, randomBytes } from "node:crypto";
import {
  db,
  eq,
  and,
  or,
  isNull,
  lte,
  asc,
  sql,
  inArray,
  lt,
  desc,
  type SQL,
} from "@repo/db";
import {
  formWebhooksTable,
  formWebhookDeliveriesTable,
  type SelectFormWebhook,
  type WebhookDeliveryStatus,
} from "@repo/db/schema";
import { assertPublicHttpUrl } from "./ssrf";

/**
 * Delivery engine for form webhooks.
 *
 * Every attempt a hook receives is recorded in `form_webhook_deliveries`, so a
 * failure is debuggable after the fact instead of collapsing into the single
 * `lastStatus` column, and a failed POST can be retried without the original
 * event having to happen again.
 *
 * Lifecycle: emit → enqueue → attempt → (retry with backoff | dead-letter).
 * The caller never awaits delivery: a slow or dead endpoint must not delay or
 * fail the submission that produced the event.
 */

// ─── Tunables ──────────────────────────────────────────────

/** First retry delay; doubles per attempt. */
export const DEFAULT_RETRY_BASE_MS = 15_000;
/** Backoff ceiling — a dead endpoint must not be hammered hourly forever. */
export const DEFAULT_RETRY_MAX_MS = 60 * 60 * 1000;
export const DEFAULT_MAX_ATTEMPTS = 5;
/** Consecutive failures after which an active hook is switched off. 0 = never. */
export const DEFAULT_AUTO_DISABLE_THRESHOLD = 25;

const REQUEST_TIMEOUT_MS = 10_000;
/** Receiver bodies are only kept for diagnosis; a huge HTML error page is not. */
const MAX_RESPONSE_BODY_CHARS = 4096;
/** Guard rail on a single stored payload, mirroring the express body limit. */
const MAX_REQUEST_BODY_CHARS = 256 * 1024;
/** Rows the worker claims per pass. */
const DEFAULT_BATCH_SIZE = 50;
/**
 * How long a claimed row stays leased before another worker may take it.
 * Must comfortably exceed REQUEST_TIMEOUT_MS so a slow in-flight attempt is
 * not stolen and duplicated.
 */
const CLAIM_LEASE_MS = 60_000;
/** Settled deliveries older than this are pruned by the worker. */
export const DEFAULT_RETENTION_DAYS = 30;

function retryDelays() {
  const configured = Number(process.env.WEBHOOK_RETRY_BASE_MS ?? "");
  const base = Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_RETRY_BASE_MS;
  const configuredMax = Number(process.env.WEBHOOK_RETRY_MAX_MS ?? "");
  const max = Number.isFinite(configuredMax) && configuredMax > 0
    ? configuredMax
    : DEFAULT_RETRY_MAX_MS;
  return { base, max: Math.max(base, max) };
}

/**
 * Exponential backoff with full jitter.
 *
 * Jitter matters because every hook subscribed to `form.published` fires in the
 * same millisecond; without it a flapping receiver would see a synchronised
 * retry storm every cycle.
 */
export function nextRetryDelayMs(attempt: number, random = Math.random) {
  const { base, max } = retryDelays();
  const exponential = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  return Math.round(exponential * (0.5 + random() * 0.5));
}

/**
 * Whether a failure is worth retrying.
 *
 * A 4xx means the receiver understood us and rejected the payload — retrying
 * the identical body cannot help, and doing so would hammer an endpoint that
 * has already said no. 408/425/429 are the exceptions: they are explicit
 * "not now" signals. Everything 5xx, plus transport-level failures (status 0),
 * is transient by assumption.
 */
export function isRetryableStatus(status: number): boolean {
  if (status === 0) return true;
  if (status === 408 || status === 425 || status === 429) return true;
  if (status >= 500) return true;
  return false;
}

function autoDisableThreshold() {
  const configured = Number(process.env.WEBHOOK_AUTO_DISABLE_FAILURES ?? "");
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_AUTO_DISABLE_THRESHOLD;
}

function maxAttempts() {
  const configured = Number(process.env.WEBHOOK_MAX_ATTEMPTS ?? "");
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_ATTEMPTS;
}

// ─── Signing ──────────────────────────────────────────────

export function generateWebhookSecret() {
  return `whsec_${randomBytes(32).toString("hex")}`;
}

function safeSecretPreview(secret: string | null): string | null {
  if (!secret) return null;
  return secret.length <= 4 ? "••••" : `••••${secret.slice(-4)}`;
}

/**
 * Signs a delivery the Stripe way: `HMAC(secret, "<timestamp>.<body>")`.
 *
 * The old scheme signed the bare body, which meant a captured request stayed
 * verifiable forever. Mixing the timestamp in lets a receiver reject anything
 * outside its replay window, and — because the timestamp rotates the signature
 * — lets an old secret be retired without rewinding past deliveries still in
 * flight.
 */
export function signWebhookPayload(
  body: string,
  secret: string | null,
  timestampSeconds: number,
): string | null {
  if (!secret) return null;
  const digest = createHmac("sha256", secret)
    .update(`${timestampSeconds}.${body}`)
    .digest("hex");
  return `t=${timestampSeconds},v1=${digest}`;
}

/** Recomputes the signature over an already-stored body, for the redeliver path. */
export function signatureForStoredBody(
  body: string,
  secret: string | null,
): { signature: string | null; timestamp: string } {
  const timestamp = Math.floor(Date.now() / 1000);
  return { signature: signWebhookPayload(body, secret, timestamp), timestamp: String(timestamp) };
}

// ─── HTTP ─────────────────────────────────────────────────

type AttemptResult =
  | { ok: true; status: number; body: string; durationMs: number }
  | { ok: false; status: number; body: string; error: string; durationMs: number };

async function postOnce(args: {
  url: string;
  body: string;
  signature: string | null;
  event: string;
  deliveryId: string;
  attempt: number;
}): Promise<AttemptResult> {
  const startedAt = Date.now();
  try {
    // Re-check on every attempt: the stored URL was validated at create time,
    // but DNS can change and the host may no longer be public.
    const target = await assertPublicHttpUrl(args.url);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Formly-Webhooks/2.0",
      "x-formly-event": args.event,
      "x-formly-delivery": args.deliveryId,
      "x-formly-attempt": String(args.attempt),
    };
    if (args.signature) headers["x-formly-signature"] = args.signature;

    const response = await fetch(target, {
      method: "POST",
      headers,
      body: args.body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // A redirect could point at an internal host that just passed the check.
      redirect: "error",
    });

    const durationMs = Date.now() - startedAt;
    const raw = await response.text().catch(() => "");
    const body = raw.slice(0, MAX_RESPONSE_BODY_CHARS);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        body,
        error: `HTTP ${response.status} ${response.statusText}`.trim(),
        durationMs,
      };
    }
    return { ok: true, status: response.status, body, durationMs };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: "",
      error: error instanceof Error ? error.message : "Delivery failed",
      durationMs: Date.now() - startedAt,
    };
  }
}

// ─── Enqueue ──────────────────────────────────────────────

/** Drops payloads too large to be worth storing or replaying. */
function isStorableBody(body: string) {
  return body.length <= MAX_REQUEST_BODY_CHARS;
}

/**
 * Records one delivery per subscribed hook and fires the first attempt.
 *
 * Returns the ids so a caller that wants to wait (the `webhook.test`
 * procedure) can await them, while the event emitters just let go.
 */
export async function enqueueDeliveries(args: {
  hooks: SelectFormWebhook[];
  event: string;
  payload: unknown;
  maxAttempts?: number;
}): Promise<string[]> {
  const { hooks, event, payload } = args;
  if (hooks.length === 0) return [];

  const body = JSON.stringify(payload);
  if (!isStorableBody(body)) {
    console.error(
      `[webhooks] dropped ${event} delivery: payload of ${body.length} chars exceeds the ${MAX_REQUEST_BODY_CHARS} char limit`,
    );
    return [];
  }

  const attempts = args.maxAttempts ?? maxAttempts();

  const inserted = await db
    .insert(formWebhookDeliveriesTable)
    .values(
      hooks.map((hook) => ({
        webhookId: hook.id,
        event,
        status: "pending" as WebhookDeliveryStatus,
        requestBody: payload as Record<string, unknown>,
        url: hook.url,
        attempt: 1,
        maxAttempts: attempts,
        // NULL means "due now". A timestamp built in Node could land marginally
        // ahead of Postgres `now()` and lose the claim race on the first try.
        nextRetryAt: null,
      })),
    )
    .returning({ id: formWebhookDeliveriesTable.id })
    .execute();

  const ids = inserted.map((row) => row.id);
  // Kick off immediately; the worker picks up whatever is still pending.
  void deliverDeliveries(ids);
  return ids;
}

// ─── Attempt ──────────────────────────────────────────────

type DeliveryRow = typeof formWebhookDeliveriesTable.$inferSelect;

async function loadHooks(ids: string[]): Promise<Map<string, SelectFormWebhook>> {
  if (ids.length === 0) return new Map();
  const hooks = await db
    .select()
    .from(formWebhooksTable)
    .where(inArray(formWebhooksTable.id, ids))
    .execute();
  return new Map(hooks.map((hook) => [hook.id, hook]));
}

/**
 * Sends one delivery and records the outcome.
 *
 * A `dead` row keeps its history; a redelivery is a fresh row rather than a
 * reset so the previous attempt stays visible in the log.
 */
export async function deliverDelivery(
  delivery: DeliveryRow,
): Promise<{ ok: boolean; status: number | null }> {
  const hooks = await loadHooks([delivery.webhookId]);
  const hook = hooks.get(delivery.webhookId);

  if (!hook) {
    // The hook was deleted while the attempt was queued; the row is gone too
    // via cascade, so this only happens in a narrow race. Nothing to report.
    await db
      .update(formWebhookDeliveriesTable)
      .set({
        status: "dead",
        error: "Webhook no longer exists",
        completedAt: new Date(),
      })
      .where(eq(formWebhookDeliveriesTable.id, delivery.id))
      .execute()
      .catch(() => undefined);
    return { ok: false, status: null };
  }

  // Disabling a hook must also silence what it already queued — otherwise the
  // auto-disable safety valve still lets a dead endpoint keep receiving
  // retries for as long as the backlog lasts. A deliberate test is exempt.
  if (!hook.active && !delivery.isTest) {
    await db
      .update(formWebhookDeliveriesTable)
      .set({
        status: "dead",
        error: "Webhook is disabled",
        completedAt: new Date(),
      })
      .where(eq(formWebhookDeliveriesTable.id, delivery.id))
      .execute()
      .catch(() => undefined);
    return { ok: false, status: null };
  }

  const body = JSON.stringify(delivery.requestBody);
  const { signature } = signatureForStoredBody(body, hook.secret);

  const result = await postOnce({
    url: delivery.url,
    body,
    signature,
    event: delivery.event,
    deliveryId: delivery.id,
    attempt: delivery.attempt,
  });

  const now = new Date();
  const attemptsLeft = delivery.attempt < delivery.maxAttempts;
  const willRetry = !result.ok && attemptsLeft && isRetryableStatus(result.status);

  let status: WebhookDeliveryStatus;
  if (result.ok) status = "success";
  else if (willRetry) status = "retrying";
  else status = "dead";

  const nextRetryAt = willRetry
    ? new Date(now.getTime() + nextRetryDelayMs(delivery.attempt))
    : null;

  await db
    .update(formWebhookDeliveriesTable)
    .set({
      status,
      // Advance the attempt counter on a retry. Without this the row would
      // keep claiming attempt 1 and retry forever, since `attemptsLeft` would
      // never fall to zero.
      attempt: willRetry ? delivery.attempt + 1 : delivery.attempt,
      responseStatus: result.ok ? result.status : result.status || null,
      responseBody: result.body || null,
      error: result.ok ? null : result.error,
      durationMs: result.durationMs,
      nextRetryAt,
      completedAt: result.ok || !willRetry ? now : null,
    })
    .where(eq(formWebhookDeliveriesTable.id, delivery.id))
    .execute()
    .catch((error: unknown) => {
      console.error("[webhooks] failed to record delivery outcome", error);
    });

  await updateHookStats(hook, {
    ok: result.ok,
    status: result.status,
    error: result.ok ? null : result.error,
    at: now,
  });

  return { ok: result.ok, status: result.status || null };
}

/**
 * Keeps the denormalised `last*` columns and the consecutive-failure counter in
 * step, disabling a hook that has been failing outright for a long time.
 *
 * Failure alone never disables a hook: a receiver that is down for an hour must
 * come back to a live hook once it recovers.
 */
async function updateHookStats(
  hook: SelectFormWebhook,
  result: { ok: boolean; status: number; error: string | null; at: Date },
): Promise<void> {
  // The counter is incremented in SQL rather than from a value read earlier:
  // two deliveries for one hook can finish close together, and a read-modify-
  // -write here would silently drop one of the failures.
  const threshold = autoDisableThreshold();
  // Estimated from the pre-increment value. The stored counter stays exact even
  // when it drifts, so only the auto-disable point can land a delivery or two
  // away from the configured threshold.
  const estimatedFailures = result.ok ? 0 : hook.consecutiveFailures + 1;
  const shouldDisable =
    !result.ok &&
    threshold > 0 &&
    estimatedFailures >= threshold &&
    hook.active;

  await db
    .update(formWebhooksTable)
    .set({
      lastStatus: result.ok ? result.status : result.status || null,
      lastError: result.error,
      lastTriggeredAt: result.at,
      consecutiveFailures: result.ok
        ? 0
        : sql`${formWebhooksTable.consecutiveFailures} + 1`,
      ...(shouldDisable
        ? {
            active: false,
            autoDisabledAt: result.at,
            autoDisabledReason: `Disabled automatically after ${estimatedFailures} consecutive failed deliveries.`,
          }
        : {}),
    })
    .where(eq(formWebhooksTable.id, hook.id))
    .execute()
    .catch((error: unknown) => {
      console.error("[webhooks] failed to update hook stats", error);
    });
}

/**
 * Takes exclusive ownership of one due delivery by pushing its next attempt
 * into the future as a lease.
 *
 * Returns null when someone else already holds it. This is what stops the
 * inline first attempt and the worker's retry pass from sending the same event
 * twice when they happen to overlap — both paths claim through here.
 */
async function claimDelivery(id: string): Promise<DeliveryRow | null> {
  const claimed = await db
    .update(formWebhookDeliveriesTable)
    .set({ nextRetryAt: new Date(Date.now() + CLAIM_LEASE_MS) })
    .where(
      and(
        eq(formWebhookDeliveriesTable.id, id),
        inArray(formWebhookDeliveriesTable.status, ["pending", "retrying"]),
        sql`(${formWebhookDeliveriesTable.nextRetryAt} IS NULL OR ${formWebhookDeliveriesTable.nextRetryAt} <= now())`,
      ),
    )
    .returning()
    .execute();
  return claimed[0] ?? null;
}

/**
 * Attempts a specific set of deliveries, one at a time.
 *
 * Sequential on purpose: a batch of 50 hooks each taking the full 10s timeout
 * would otherwise pin the process for minutes, and the queue is drained again
 * on the next tick anyway.
 */
export async function deliverDeliveries(
  ids: string[],
): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];
  for (const id of ids) {
    const row = await claimDelivery(id);
    // Null means the delivery is already settled, leased by the worker, or not
    // due yet — none of which are reasons to send it again.
    if (!row) continue;

    const outcome = await deliverDelivery(row);
    results.push({ id: row.id, ...outcome });
  }
  return results;
}

export type DeliveryResult = {
  id: string;
  ok: boolean;
  status: number | null;
};

/**
 * Claims due deliveries and attempts them.
 *
 * The claim is a single `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP
 * LOCKED)`, which is atomic without an explicit transaction: two workers
 * running on different instances cannot select the same row, and a worker that
 * dies mid-attempt releases its lease when the lease expires.
 */
export async function drainDueDeliveries(
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<number> {
  const leaseUntil = new Date(Date.now() + CLAIM_LEASE_MS);

  // The inner SELECT locks the rows it picks and skips any row another worker
  // already holds, which is what makes this safe to run on several instances
  // at once. It is deliberately a single statement: the lease and the claim
  // commit together or not at all.
  const due = db
    .select({ id: formWebhookDeliveriesTable.id })
    .from(formWebhookDeliveriesTable)
    .where(
      and(
        inArray(formWebhookDeliveriesTable.status, ["pending", "retrying"]),
        or(
          isNull(formWebhookDeliveriesTable.nextRetryAt),
          lte(formWebhookDeliveriesTable.nextRetryAt, sql`now()`),
        ),
      ),
    )
    .orderBy(asc(formWebhookDeliveriesTable.nextRetryAt))
    .limit(batchSize)
    .for("update", { skipLocked: true });

  const claimed = await db
    .update(formWebhookDeliveriesTable)
    .set({ nextRetryAt: leaseUntil })
    .where(inArray(formWebhookDeliveriesTable.id, due))
    .returning()
    .execute();

  for (const row of claimed) {
    await deliverDelivery(row);
  }
  return claimed.length;
}

/**
 * Re-sends a settled delivery verbatim, as a new row.
 *
 * The original body is reused rather than rebuilt so the receiver sees the same
 * `x-formly-delivery` payload it already failed on, which makes duplicate
 * suppression on their side reliable.
 */
export async function redeliver(
  delivery: DeliveryRow,
): Promise<string | null> {
  const hooks = await loadHooks([delivery.webhookId]);
  if (!hooks.has(delivery.webhookId)) return null;

  const inserted = await db
    .insert(formWebhookDeliveriesTable)
    .values({
      webhookId: delivery.webhookId,
      event: delivery.event,
      status: "pending",
      requestBody: delivery.requestBody,
      url: delivery.url,
      attempt: 1,
      maxAttempts: delivery.maxAttempts,
      isTest: delivery.isTest,
      // NULL = due immediately; see the note in enqueueDeliveries.
      nextRetryAt: null,
    })
    .returning({ id: formWebhookDeliveriesTable.id })
    .execute();

  const id = inserted[0]?.id ?? null;
  if (id) void deliverDeliveries([id]);
  return id;
}

// ─── Retention ────────────────────────────────────────────

/**
 * Deletes settled deliveries past the retention window.
 *
 * Only terminal states are eligible: a queued retry must never be pruned out
 * from under the worker, however old its row is.
 */
export async function pruneDeliveries(
  retentionDays = DEFAULT_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(formWebhookDeliveriesTable)
    .where(
      and(
        inArray(formWebhookDeliveriesTable.status, ["success", "dead"]),
        lt(formWebhookDeliveriesTable.createdAt, cutoff),
      ),
    )
    .returning({ id: formWebhookDeliveriesTable.id })
    .execute();
  return deleted.length;
}

// ─── Queries used by the builder UI ───────────────────────

/** Recent attempts for one hook, newest first. */
export async function listDeliveries(args: {
  webhookId: string;
  limit?: number;
  status?: WebhookDeliveryStatus;
  event?: string;
}): Promise<DeliveryRow[]> {
  const conditions: SQL[] = [eq(formWebhookDeliveriesTable.webhookId, args.webhookId)];
  if (args.status) {
    conditions.push(eq(formWebhookDeliveriesTable.status, args.status));
  }
  if (args.event) {
    conditions.push(eq(formWebhookDeliveriesTable.event, args.event));
  }
  return db
    .select()
    .from(formWebhookDeliveriesTable)
    .where(and(...conditions))
    .orderBy(desc(formWebhookDeliveriesTable.createdAt))
    .limit(args.limit ?? 25)
    .execute();
}

export async function countDeliveries(
  webhookId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      status: formWebhookDeliveriesTable.status,
      value: sql<number>`count(*)::int`,
    })
    .from(formWebhookDeliveriesTable)
    .where(eq(formWebhookDeliveriesTable.webhookId, webhookId))
    .groupBy(formWebhookDeliveriesTable.status)
    .execute();
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.value)]));
}

export { safeSecretPreview, DEFAULT_BATCH_SIZE, MAX_RESPONSE_BODY_CHARS };
