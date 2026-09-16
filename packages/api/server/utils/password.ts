import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PREFIX = "scrypt$";
const KEY_LEN = 64;

/**
 * Hashes a password for storage in form settings. Values that are already
 * hashed (from a previous save round-trip) are returned untouched so the
 * owner can re-save settings without re-hashing the hash.
 */
export function hashPassword(password: string): string {
  if (password.startsWith(PREFIX)) return password;
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN).toString("hex");
  return `${PREFIX}${salt}$${hash}`;
}

/**
 * Verifies a plaintext password against a stored value. Supports the scrypt
 * format produced by `hashPassword` plus legacy plaintext values.
 */
export function verifyPassword(password: string, stored: string): boolean {
  if (!stored.startsWith(PREFIX)) {
    return stored === password;
  }
  const parts = stored.split("$");
  if (parts.length !== 3) return false;
  const expected = Buffer.from(parts[2]!, "hex");
  if (expected.length !== KEY_LEN) return false;
  const candidate = scryptSync(password, parts[1]!, KEY_LEN);
  return timingSafeEqual(expected, candidate);
}