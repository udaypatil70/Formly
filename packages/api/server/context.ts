import { auth } from "@repo/services/auth";
import type { IncomingMessage } from "http";

export async function createContext({ req }: { req: IncomingMessage }) {
  const session = await auth.api.getSession({
    headers: req.headers as Record<string, string>,
  });

  return {
    session,
    user: session?.user ?? null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
