import { auth } from "@repo/services/auth";
import { env } from "@repo/services/env";
import type { IncomingMessage } from "http";

/**
 * Resolves the client IP used for rate limiting and audit hashes.
 *
 * `x-forwarded-for` is attacker-controlled: anyone can send an arbitrary value
 * and reset their own rate-limit bucket. It is therefore only honoured when
 * the deployment declares it sits behind a trusted proxy via TRUST_PROXY.
 * Otherwise the socket address is used, which cannot be spoofed.
 */
function resolveIp(req: IncomingMessage): string | null {
  const trustProxy = env.TRUST_PROXY;
  const socketIp = req.socket?.remoteAddress ?? null;

  if (!trustProxy) return socketIp;

  const headerName = trustProxy.toLowerCase().trim();
  const headerValue =
    headerName === "x-forwarded-for"
      ? req.headers["x-forwarded-for"]
      : req.headers[headerName];

  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const first = raw?.toString().split(",")[0]?.trim();
  return first || socketIp;
}

/**
 * Resolves the browser-scoped visitor id used to bind drafts and anonymous
 * response edits. It is a random id created by the public client, never a
 * fingerprint, so a visitor can clear it at any time by clearing site data.
 */
function resolveVisitorId(req: IncomingMessage): string | null {
  const header = req.headers["x-formly-visitor"];
  const raw = Array.isArray(header) ? header[0] : header;
  const candidate = raw?.toString().trim();

  if (candidate && /^[A-Za-z0-9_-]{8,64}$/.test(candidate)) {
    return candidate;
  }

  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const match = /(?:^|;\s*)formly_visitor=([A-Za-z0-9_-]{8,64})/.exec(cookieHeader);
  return match?.[1] ?? null;
}

export async function createContext({ req }: { req: IncomingMessage }) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      headers.set(key, Array.isArray(value) ? value[0] ?? "" : value);
    }
  }

  const session = await auth.api.getSession({ headers });

  return {
    session,
    user: session?.user ?? null,
    ip: resolveIp(req),
    visitorId: resolveVisitorId(req),
    headers,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
