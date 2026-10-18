import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "./env";

/**
 * Signed, expiring download URLs for uploaded files.
 *
 * An upload URL is embedded in a stored answer, so it is handed out to whoever
 * can see that answer (the form owner, webhook consumers, CSV exports). Making
 * the URL itself the capability means a leaked link expires on its own instead
 * of staying a permanent public object URL.
 *
 * Lives in services because both the API (which mints a URL when a submission
 * claims an upload) and the upload server (which verifies one) must agree on
 * the secret.
 */

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Falls back to the auth secret so deployments need no extra configuration. */
function signingSecret(): string {
  return env.UPLOAD_SIGNING_SECRET || env.BETTER_AUTH_SECRET;
}

function signatureFor(storedName: string, expiresAt: number): string {
  return createHmac("sha256", signingSecret())
    .update(`${storedName}:${expiresAt}`)
    .digest("hex");
}

/** Relative download path carrying its own expiry and signature. */
export function signUploadPath(
  storedName: string,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  const expiresAt = Date.now() + ttlMs;
  const sig = signatureFor(storedName, expiresAt);
  return `/uploads/${storedName}?expires=${expiresAt}&sig=${sig}`;
}

export function verifyUploadSignature(
  storedName: string,
  expiresAt: string | undefined,
  sig: string | undefined,
): boolean {
  if (!expiresAt || !sig) return false;

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;

  const expected = signatureFor(storedName, expiry);
  const provided = Buffer.from(sig, "hex");
  const computed = Buffer.from(expected, "hex");
  if (provided.length !== computed.length) return false;

  return timingSafeEqual(provided, computed);
}
