import { logger } from "@repo/logger";

import {
  deleteOrphanUpload,
  findOrphanUploads,
  removeUploadFile,
} from "./uploads";

/**
 * Sweeps uploads that no submission ever claimed.
 *
 * A visitor can upload a file and then abandon the form, or the submission can
 * fail after the upload succeeded. Without a sweeper those rows — and the bytes
 * on disk — accumulate forever, which is both a storage leak and a way to fill
 * the disk by hitting /upload directly.
 *
 * The grace period must comfortably exceed a slow fill-out, since an upload
 * sits unclaimed for as long as the visitor takes to complete the form.
 */

const DEFAULT_GRACE_HOURS = 24;
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // hourly
const DEFAULT_BATCH = 500;

export function startUploadSweeper(
  uploadsDir: string,
  options: { graceHours?: number; intervalMs?: number } = {},
): () => void {
  const graceHours = options.graceHours ?? DEFAULT_GRACE_HOURS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const cutoff = () => new Date(Date.now() - graceHours * 60 * 60 * 1000);

  const sweep = async () => {
    try {
      const orphans = await findOrphanUploads(cutoff());
      if (orphans.length === 0) return;

      let removed = 0;
      for (const orphan of orphans) {
        // The row is deleted first and only when it is still unclaimed, so a
        // submission landing mid-sweep keeps its file.
        if (await deleteOrphanUpload(orphan.id)) {
          removeUploadFile(uploadsDir, orphan.storedName);
          removed += 1;
        }
      }
      logger.info("upload sweeper removed orphaned uploads", {
        removed,
        considered: orphans.length,
      });
    } catch (error) {
      logger.error("upload sweeper failed", { err: error });
    }
  };

  const timer = setInterval(() => void sweep(), intervalMs);
  // Do not hold the process open just to run housekeeping.
  timer.unref?.();

  return () => clearInterval(timer);
}

export { DEFAULT_GRACE_HOURS, DEFAULT_BATCH };
