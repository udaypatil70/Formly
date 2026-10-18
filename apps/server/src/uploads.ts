import { randomUUID, createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import multer from "multer";
import express from "express";
import { and, count, db, eq, isNull, lt } from "@repo/db";
import {
  fieldsTable,
  formFileUploadsTable,
  formsTable,
} from "@repo/db/schema";
import { verifyUploadSignature, signUploadPath } from "@repo/services/upload-signature";
import { auth } from "@repo/services/auth";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB per file
/** Global ceiling used when a field sets no `maxSize` of its own. */
const DEFAULT_MAX_SIZE_MB = 25;

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

/** Uploads a single form accepts per hour, across all visitors. */
const UPLOAD_MAX_PER_FORM_PER_HOUR = 200;

function safeExtension(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return ext.slice(0, 12) || ".bin";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hashIp = (ip: string) =>
  createHash("sha256").update(`formly-salt:${ip}`).digest("hex");

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

  /**
   * True when the request carries a session for the form's owner. Used so the
   * owner can always open a stored answer link, even after its signature has
   * expired — the owner already passes the ownership check in the UI.
   */
  async function isFormOwner(request: express.Request, ownerId: string) {
    try {
      const headers = new Headers();
      const cookie = request.headers.cookie;
      if (cookie) headers.set("cookie", cookie);
      const session = await auth.api.getSession({ headers });
      return session?.user?.id === ownerId;
    } catch {
      return false;
    }
  }

  router.get("/uploads/:storedName", async (req, res) => {
    const storedName = req.params.storedName ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i.test(storedName)) {
      return res.status(400).json({ error: "Invalid file reference" });
    }

    const rows = await db
      .select({
        storedName: formFileUploadsTable.storedName,
        originalName: formFileUploadsTable.originalName,
        mimeType: formFileUploadsTable.mimeType,
        formId: formFileUploadsTable.formId,
        responseId: formFileUploadsTable.responseId,
      })
      .from(formFileUploadsTable)
      .where(eq(formFileUploadsTable.storedName, storedName))
      .limit(1)
      .execute();

    const file = rows[0];
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    // A file is readable by whoever holds a live signed link for it, or by the
    // form's owner. An unclaimed upload has no answer to protect yet, so its
    // upload-time link is all that grants access.
    const signed = verifyUploadSignature(
      file.storedName,
      req.query.expires as string | undefined,
      req.query.sig as string | undefined,
    );
    const claimed = file.responseId !== null;
    if (!signed && !claimed) {
      return res.status(404).json({ error: "File not found" });
    }

    if (claimed && !signed) {
      const [owner] = await db
        .select({ ownerId: formsTable.ownerId })
        .from(formsTable)
        .where(eq(formsTable.id, file.formId))
        .limit(1)
        .execute();
      if (!owner || !(await isFormOwner(req, owner.ownerId))) {
        return res.status(404).json({ error: "File not found" });
      }
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
    res.setHeader(
      "Content-Disposition",
      `${FORBIDDEN_INLINE.has(file.mimeType) ? "attachment" : "inline"}; filename*=UTF-8''${encodedName}`,
    );
    // Private: a signed URL is a capability, so it must not sit in a shared cache.
    res.header("Cache-Control", "private, max-age=3600");

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
      const fieldId = String(req.body?.fieldId ?? "");
      // Checked before any query: Postgres raises on a malformed uuid, which
      // would otherwise surface as a 500 for a plainly bad request.
      if (!UUID_RE.test(formId) || !UUID_RE.test(fieldId)) {
        return res.status(400).json({ error: "formId and fieldId are required" });
      }

      // Uploads are anonymous by design, so the form must actually be accepting
      // responses. Without this any form UUID turns /upload into a free file
      // host, including drafts and archived forms.
      const formRows = await db
        .select({ id: formsTable.id, archived: formsTable.archived, status: formsTable.status })
        .from(formsTable)
        .where(eq(formsTable.id, formId))
        .limit(1)
        .execute();
      const form = formRows[0];
      if (!form || form.archived || form.status !== "published") {
        return res.status(404).json({ error: "Form not found" });
      }

      // Binding the upload to one of this form's own file fields is what makes
      // the per-field rules enforceable: a crafted request cannot pick a field
      // from another form to borrow a looser configuration.
      const fieldRows = await db
        .select({
          id: fieldsTable.id,
          type: fieldsTable.type,
          validationRules: fieldsTable.validationRules,
        })
        .from(fieldsTable)
        .where(and(eq(fieldsTable.id, fieldId), eq(fieldsTable.formId, form.id)))
        .limit(1)
        .execute();
      const field = fieldRows[0];
      if (!field || field.type !== "file_upload") {
        return res.status(400).json({ error: "Not a file field on this form" });
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

      // Per-field rules were previously enforced only in the browser, so a
      // crafted multipart body bypassed them entirely. They are applied here as
      // the actual limit, with the global caps as the ceiling.
      const rules = (field.validationRules ?? {}) as {
        maxSize?: number;
        allowedTypes?: string[];
      };
      const maxSizeMb = Math.min(
        Math.max(Number(rules.maxSize ?? DEFAULT_MAX_SIZE_MB), 0.1),
        MAX_FILE_SIZE / 1024 / 1024,
      );
      if (req.file.size > maxSizeMb * 1024 * 1024) {
        return res.status(413).json({
          error: `File exceeds the ${maxSizeMb} MB limit for this field`,
        });
      }
      const allowedTypes = (rules.allowedTypes ?? [])
        .map((type) => type.split(";")[0]!.trim().toLowerCase())
        .filter(Boolean);
      if (allowedTypes.length > 0 && !allowedTypes.includes(mimeType)) {
        return res.status(415).json({
          error: `File type "${mimeType}" is not allowed for this field`,
        });
      }

      // One form's upload endpoint must not become a bulk storage account for
      // whoever discovers its id.
      const [recent] = await db
        .select({ count: count() })
        .from(formFileUploadsTable)
        .where(
          and(
            eq(formFileUploadsTable.formId, form.id),
            lt(formFileUploadsTable.createdAt, new Date(Date.now() - 3_600_000)),
          ),
        )
        .execute();
      if (Number(recent?.count ?? 0) >= UPLOAD_MAX_PER_FORM_PER_HOUR) {
        return res.status(429).json({ error: "This form is receiving too many uploads" });
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
          fieldId: field.id,
          storedName,
          originalName,
          mimeType,
          size: req.file.size,
          uploadedByIpHash: hashIp(ip),
        })
        .returning()
        .execute();

      const row = inserted[0]!;
      return res.status(201).json({
        fileId: row.id,
        name: row.originalName,
        size: row.size,
        mimeType: row.mimeType,
        // Relative: the client prefixes its own API origin when it builds the
        // stored answer. The signature and expiry travel with the path.
        url: signUploadPath(row.storedName),
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

/** Deletes the file behind an upload row, ignoring a file that is already gone. */
export function removeUploadFile(uploadsDir: string, storedName: string): void {
  try {
    // `basename` guards against a stored name that somehow escaped the uploads
    // directory.
    const fullPath = path.join(uploadsDir, path.basename(storedName));
    if (existsSync(fullPath)) unlinkSync(fullPath);
  } catch (error) {
    console.warn("Could not delete upload file", { storedName, error });
  }
}

/** Uploads older than the grace period that no submission ever claimed. */
export async function findOrphanUploads(olderThan: Date) {
  return db
    .select({ id: formFileUploadsTable.id, storedName: formFileUploadsTable.storedName })
    .from(formFileUploadsTable)
    .where(
      and(
        isNull(formFileUploadsTable.responseId),
        lt(formFileUploadsTable.createdAt, olderThan),
      ),
    )
    .limit(500)
    .execute();
}

/** Removes an orphan row. Returns false when a submission claimed it meanwhile. */
export async function deleteOrphanUpload(id: string): Promise<boolean> {
  const deleted = await db
    .delete(formFileUploadsTable)
    .where(and(eq(formFileUploadsTable.id, id), isNull(formFileUploadsTable.responseId)))
    .returning({ id: formFileUploadsTable.id })
    .execute();
  return deleted.length > 0;
}
