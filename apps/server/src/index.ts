import http from "node:http";
import { logger } from "@repo/logger";
import { app as expressApplication } from "./server";
import { startUploadSweeper } from "./upload-sweeper";

import { env } from "./env";

async function init() {
  try {
    const server = http.createServer(expressApplication);
    const PORT: number = env.PORT ? +env.PORT : 8000;
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
  } catch (err) {
    logger.error(`Error creating http server`, { err });
    process.exit(1);
  }
}

init();
