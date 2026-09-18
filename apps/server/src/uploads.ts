import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import express from "express";
import { db, eq } from "@repo/db";
import { formFileUploadsTable, formsTable } from "@repo/db/schema";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB per file

const ALLOWED_MIME = new Set([
  // images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
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

function safeExtension(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return ext.slice(0, 12) || ".bin";
}

// In-memory per-IP rate limiter (uploads only; cheap and scoped).
const uploadWindow = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = uploadWindow.get(ip);
  if (!entry || entry.resetAt < now) {
    uploadWindow.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 10;
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

    const data = await readFile(fullPath);
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );
    res.header("Cache-Control", "public, max-age=31536000, immutable");
    return res.send(data);
  });

  router.post("/upload", upload.single("file"), async (req, res) => {
    try {
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

      if (!ALLOWED_MIME.has(req.file.mimetype)) {
        return res.status(415).json({
          error: `File type "${req.file.mimetype}" is not allowed`,
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
          mimeType: req.file.mimetype,
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