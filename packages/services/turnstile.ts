const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Verifies a Cloudflare Turnstile token server-side.
 *
 * A missing secret no longer silently disables the check in production: that
 * turned misconfiguration into an open submission endpoint. Set
 * `TURNSTILE_DISABLED=true` to opt out explicitly (local development still
 * runs without a secret). When configured, a missing/invalid token fails.
 */
export async function verifyTurnstileToken(token?: string, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    const explicitlyDisabled = process.env.TURNSTILE_DISABLED === "true";
    const development = process.env.NODE_ENV !== "production";
    if (!explicitlyDisabled && !development) {
      console.error(
        "Turnstile is not configured. Set TURNSTILE_SECRET_KEY or TURNSTILE_DISABLED=true.",
      );
      return false;
    }
    return true;
  }

  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
