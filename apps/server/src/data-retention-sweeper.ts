import { and, auditLogsTable, db, formDraftsTable, inArray, lt } from "@repo/db";
import { logger } from "@repo/logger";

const BATCH_SIZE = 500;
const MAX_BATCHES_PER_SWEEP = 20;

async function deleteExpiredDrafts(cutoff: Date): Promise<number> {
  let deleted = 0;
  for (let batch = 0; batch < MAX_BATCHES_PER_SWEEP; batch += 1) {
    const rows = await db
      .select({ id: formDraftsTable.id })
      .from(formDraftsTable)
      .where(lt(formDraftsTable.expiresAt, cutoff))
      .limit(BATCH_SIZE)
      .execute();
    if (rows.length === 0) break;

    const ids = rows.map((row) => row.id);
    const removed = await db
      .delete(formDraftsTable)
      .where(
        and(
          inArray(formDraftsTable.id, ids),
          lt(formDraftsTable.expiresAt, cutoff),
        ),
      )
      .returning({ id: formDraftsTable.id })
      .execute();
    deleted += removed.length;
    if (rows.length < BATCH_SIZE) break;
  }
  return deleted;
}

async function deleteOldAuditLogs(cutoff: Date): Promise<number> {
  let deleted = 0;
  for (let batch = 0; batch < MAX_BATCHES_PER_SWEEP; batch += 1) {
    const rows = await db
      .select({ id: auditLogsTable.id })
      .from(auditLogsTable)
      .where(lt(auditLogsTable.createdAt, cutoff))
      .limit(BATCH_SIZE)
      .execute();
    if (rows.length === 0) break;

    const ids = rows.map((row) => row.id);
    const removed = await db
      .delete(auditLogsTable)
      .where(
        and(
          inArray(auditLogsTable.id, ids),
          lt(auditLogsTable.createdAt, cutoff),
        ),
      )
      .returning({ id: auditLogsTable.id })
      .execute();
    deleted += removed.length;
    if (rows.length < BATCH_SIZE) break;
  }
  return deleted;
}

export function startDataRetentionSweeper(options: {
  intervalMs: number;
  auditRetentionDays: number;
}): () => void {
  const sweep = async () => {
    try {
      const now = new Date();
      const auditCutoff = new Date(
        now.getTime() - options.auditRetentionDays * 24 * 60 * 60 * 1000,
      );
      const [drafts, auditEvents] = await Promise.all([
        deleteExpiredDrafts(now),
        deleteOldAuditLogs(auditCutoff),
      ]);
      if (drafts > 0 || auditEvents > 0) {
        logger.info("data retention sweep removed expired records", {
          drafts,
          auditEvents,
          auditRetentionDays: options.auditRetentionDays,
        });
      }
    } catch (error) {
      logger.error("data retention sweep failed", { err: error });
    }
  };

  void sweep();
  const timer = setInterval(() => void sweep(), options.intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
