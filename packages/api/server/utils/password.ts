import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const PREFIX = "scrypt$";
const KEY_LEN = 64;
const SALT_LEN = 16;

// Explicit cost parameters. Defaults are stated rather than inherited so the
// stored format stays reproducible if Node's defaults ever change.
const COST = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const HASH_FORMAT = /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/;

function derive(password: string, salt: string, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, COST, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

/** True when the value is already in our scrypt format (re-save round-trip). */
export function isHashedPassword(value: string): boolean {
  return HASH_FORMAT.test(value);
}

/**
 * Hashes a password for storage in form settings. Values that are already
 * hashed (from a previous save round-trip) are returned untouched so the
 * owner can re-save settings without re-hashing the hash.
 *
 * Async by design: scrypt is intentionally expensive, and running it
 * synchronously lets a stream of password attempts stall the event loop.
 */
export async function hashPassword(password: string): Promise<string> {
  if (isHashedPassword(password)) return password;
  const salt = randomBytes(SALT_LEN).toString("hex");
  const hash = await derive(password, salt, KEY_LEN);
  return `${PREFIX}${salt}$${hash.toString("hex")}`;
}

/**
 * Verifies a plaintext password against a stored value.
 *
 * Supports the scrypt format produced by `hashPassword` plus values written
 * before hashing existed. The legacy path is compared in constant time so it
 * leaks no timing information.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored || !password) return false;

  if (!isHashedPassword(stored)) {
    // Legacy plaintext value. Compare fixed-length digests in constant time so
    // neither the content nor the length of the secret leaks via timing.
    const expected = sha256(stored);
    const provided = sha256(password);
    return timingSafeEqual(expected, provided);
  }

  const parts = stored.split("$");
  const salt = parts[1];
  const expected = Buffer.from(parts[2]!, "hex");
  if (!salt || expected.length !== KEY_LEN) return false;

  try {
    const candidate = await derive(password, salt, KEY_LEN);
    return timingSafeEqual(expected, candidate);
  } catch {
    return false;
  }
}

/**
 * SHA-256 is used only to give both sides of the legacy comparison a fixed
 * 32-byte length for timingSafeEqual. It is not the storage format.
 */
function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}
