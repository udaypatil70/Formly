import { logger } from "@repo/logger";
import {
  drainDueDeliveries,
  pruneDeliveries,
} from "@repo/api/server/utils/webhook-delivery";

/**
 * Retries webhook deliveries that failed, and prunes settled history.
 *
 * The first attempt happens inline on the emitting request, but a receiver that
 * was down, rate-limiting, or briefly unreachable needs someone to come back
 * later. That is this worker.
 *
 * Rows are claimed atomically (`FOR UPDATE SKIP LOCKED`), so running several
 * instances is safe — each row is picked up by exactly one of them. Nothing
 * here is allowed to throw into the request path; it is housekeeping.
 */

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_RETENTION_DAYS = 30;
/** Pruning is O(table); run it far less often than the drain. */
const DEFAULT_PRUNE_EVERY_MS = 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 50;

export function startWebhookWorker(
  options: {
    intervalMs?: number;
    retentionDays?: number;
    pruneIntervalMs?: number;
    batchSize?: number;
  } = {},
): () => void {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const pruneIntervalMs =
    options.pruneIntervalMs ?? DEFAULT_PRUNE_EVERY_MS;
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  let running = false;
  let lastPruneAt = 0;

  const drain = async () => {
    // A slow batch must not overlap the next tick: two passes would race for
    // the same rows and double-send.
    if (running) return;
    running = true;
    try {
      const claimed = await drainDueDeliveries(batchSize);
      if (claimed > 0) {
        logger.debug("webhook worker drained deliveries", { claimed });
      }

      if (Date.now() - lastPruneAt >= pruneIntervalMs) {
        lastPruneAt = Date.now();
        const pruned = await pruneDeliveries(retentionDays);
        if (pruned > 0) {
          logger.debug("webhook worker pruned deliveries", { pruned });
        }
      }
    } catch (error) {
      logger.error("webhook worker failed", { err: error });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void drain(), intervalMs);
  // Do not hold the process open just to run housekeeping.
  timer.unref?.();

  // Pick up anything already queued on boot rather than waiting a full tick.
  void drain();

  return () => clearInterval(timer);
}

export { DEFAULT_INTERVAL_MS, DEFAULT_RETENTION_DAYS, DEFAULT_BATCH_SIZE };
