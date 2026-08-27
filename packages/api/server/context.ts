import { auth } from "@repo/services/auth";
import type { IncomingMessage } from "http";

export async function createContext({ req }: { req: IncomingMessage }) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      headers.set(key, Array.isArray(value) ? value[0] ?? "" : value);
    }
  }

  const session = await auth.api.getSession({ headers });

  const ip =
    req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ??
    req.socket?.remoteAddress ??
    null;

  return {
    session,
    user: session?.user ?? null,
    ip,
    headers,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;