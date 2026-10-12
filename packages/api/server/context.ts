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
    headers,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
