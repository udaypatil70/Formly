import http from "node:http";
import { logger } from "@repo/logger";
import { app as expressApplication } from "./server";
import { startUploadSweeper } from "./upload-sweeper";
import { startWebhookWorker } from "./webhook-worker";
import { startDataRetentionSweeper } from "./data-retention-sweeper";
import { startAnalyticsNotificationListener } from "./analytics-events";

import { env } from "./env";

async function init() {
  try {
    const server = http.createServer(expressApplication);
    const PORT: number = env.PORT ? +env.PORT : 8000;
    await startAnalyticsNotificationListener();
    server.listen(PORT, () => {
      logger.info(`http server is running on PORT ${PORT}`);
    });

    // Uploads a visitor abandons are never referenced by a submission, so they
    // are collected here rather than accumulating on disk forever.
    if (env.UPLOAD_SWEEP_INTERVAL_MS > 0) {
      startUploadSweeper(env.UPLOADS_DIR, {
        graceHours: env.UPLOAD_SWEEP_GRACE_HOURS,
        intervalMs: env.UPLOAD_SWEEP_INTERVAL_MS,
      });
      logger.info("upload sweeper started", {
        graceHours: env.UPLOAD_SWEEP_GRACE_HOURS,
        intervalMs: env.UPLOAD_SWEEP_INTERVAL_MS,
      });
    }

    // A receiver that was down at the moment an event fired has no other path
    // back to the payload, so retries run here.
    if (env.WEBHOOK_WORKER_INTERVAL_MS > 0) {
      startWebhookWorker({
        intervalMs: env.WEBHOOK_WORKER_INTERVAL_MS,
        retentionDays: env.WEBHOOK_RETENTION_DAYS,
      });
      logger.info("webhook worker started", {
        intervalMs: env.WEBHOOK_WORKER_INTERVAL_MS,
        retentionDays: env.WEBHOOK_RETENTION_DAYS,
      });
    }

    if (env.DATA_RETENTION_INTERVAL_MS > 0) {
      startDataRetentionSweeper({
        intervalMs: env.DATA_RETENTION_INTERVAL_MS,
        auditRetentionDays: env.AUDIT_LOG_RETENTION_DAYS,
      });
      logger.info("data retention sweeper started", {
        intervalMs: env.DATA_RETENTION_INTERVAL_MS,
        auditRetentionDays: env.AUDIT_LOG_RETENTION_DAYS,
      });
    }
  } catch (err) {
    logger.error(`Error creating http server`, { err });
    process.exit(1);
  }
}

init();
