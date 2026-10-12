import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import multer from "multer";
import express from "express";
import { db, eq } from "@repo/db";
import { formFileUploadsTable, formsTable } from "@repo/db/schema";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB per file

/**
 * Types a browser will happily execute in the page origin. Everything here is
 * served inline from the app domain, so script-capable types (notably SVG) are
 * excluded to prevent stored XSS.
 */
const ALLOWED_MIME = new Set([
  // images (raster only — no SVG/HTML)
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  // documents
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/json",
  "application/zip",
  // audio / video
  "audio/mpeg",
  "audio/wav",
  "video/mp4",
]);

/**
 * Content types that must never be rendered inline in the browser. Everything
 * allowed above is either an image, plain text or an opaque binary, so these
 * are forced to download.
 */
const FORBIDDEN_INLINE = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/xml",
  "text/xml",
  "application/javascript",
  "text/javascript",
]);

function safeExtension(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return ext.slice(0, 12) || ".bin";
}

// In-memory per-IP rate limiter (uploads only; cheap and scoped).
const uploadWindow = new Map<string, { count: number; resetAt: number }>();
const UPLOAD_WINDOW_MS = 60_000;
const UPLOAD_MAX_PER_WINDOW = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = uploadWindow.get(ip);
  if (!entry || entry.resetAt < now) {
    uploadWindow.set(ip, { count: 1, resetAt: now + UPLOAD_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > UPLOAD_MAX_PER_WINDOW;
}

/** Drops expired buckets so the map cannot grow without bound. */
function pruneUploadWindow(): void {
  const now = Date.now();
  for (const [key, entry] of uploadWindow) {
    if (entry.resetAt < now) uploadWindow.delete(key);
  }
}

const upload = multer({
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

export function uploadsRouter(uploadsDir: string): express.Router {
  const router = express.Router();

  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }

  router.get("/uploads/:storedName", async (req, res) => {
    const storedName = req.params.storedName ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i.test(storedName)) {
      return res.status(400).json({ error: "Invalid file reference" });
    }

    const rows = await db
      .select()
      .from(formFileUploadsTable)
      .where(eq(formFileUploadsTable.storedName, storedName))
      .limit(1)
      .execute();

    const file = rows[0];
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    const fullPath = path.join(uploadsDir, file.storedName);
    if (!existsSync(fullPath)) {
      return res.status(404).json({ error: "File missing on disk" });
    }

    // Never let a browser sniff the body into a script-capable type.
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Defense in depth if a future type slips through the allow-list.
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Content-Type", file.mimeType);

    const encodedName = encodeURIComponent(file.originalName);
    if (FORBIDDEN_INLINE.has(file.mimeType)) {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodedName}`,
      );
    } else {
      res.setHeader(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodedName}`,
      );
    }
    res.header("Cache-Control", "public, max-age=31536000, immutable");

    // Streamed rather than buffered so a large file cannot exhaust memory.
    return createReadStream(fullPath).pipe(res);
  });

  router.post("/upload", upload.single("file"), async (req, res) => {
    try {
      pruneUploadWindow();
      const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
      if (isRateLimited(ip)) {
        return res.status(429).json({ error: "Too many uploads, try again later" });
      }

      const formId = String(req.body?.formId ?? "");
      if (!formId) {
        return res.status(400).json({ error: "formId is required" });
      }

      const formRows = await db
        .select({ id: formsTable.id, archived: formsTable.archived })
        .from(formsTable)
        .where(eq(formsTable.id, formId))
        .limit(1)
        .execute();
      const form = formRows[0];
      if (!form || form.archived) {
        return res.status(404).json({ error: "Form not found" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      // Browsers may send a parameterised type such as `text/plain; charset=utf-8`.
      const mimeType = req.file.mimetype.split(";")[0]!.trim().toLowerCase();
      if (!ALLOWED_MIME.has(mimeType)) {
        return res.status(415).json({
          error: `File type "${mimeType}" is not allowed`,
        });
      }

      const originalName = req.file.originalname || "file";
      const storedName = `${randomUUID()}${safeExtension(originalName)}`;
      const dest = path.join(uploadsDir, storedName);

      await new Promise<void>((resolve, reject) => {
        const writer = createWriteStream(dest);
        writer.on("error", reject);
        writer.on("finish", () => resolve());
        writer.write(req.file!.buffer);
        writer.end();
      });

      const inserted = await db
        .insert(formFileUploadsTable)
        .values({
          formId: form.id,
          storedName,
          originalName,
          mimeType,
          size: req.file.size,
        })
        .returning()
        .execute();

      const row = inserted[0]!;
      return res.status(201).json({
        fileId: row.id,
        name: row.originalName,
        size: row.size,
        mimeType: row.mimeType,
        url: `/uploads/${row.storedName}`,
      });
    } catch (error) {
      console.error("Upload failed:", error);
      return res.status(500).json({ error: "Upload failed" });
    }
  });

  // Multer errors (size limit, unexpected field) → clean JSON.
  router.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? `File exceeds the ${MAX_FILE_SIZE / 1024 / 1024} MB limit`
          : "Upload failed";
      return res.status(400).json({ error: message });
    }
    return next(error);
  });

  return router;
}