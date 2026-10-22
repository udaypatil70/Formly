import { Router } from "express";
import { db, eq, formsTable } from "@repo/db";
import { createContext } from "@repo/api/server";
import { subscribeToAnalytics } from "./analytics-events";

const connectionCounts = new Map<string, number>();
const MAX_CONNECTIONS_PER_USER = 5;

export function analyticsEventsRouter(): Router {
  const router = Router();

  router.get("/api/analytics/:formId/events", async (req, res, next) => {
    try {
      if (!/^[0-9a-f-]{36}$/i.test(req.params.formId ?? "")) {
        res.status(400).json({ message: "Invalid form id" });
        return;
      }

      const context = await createContext({ req });
      if (!context.user) {
        res.status(401).json({ message: "Authentication required" });
        return;
      }

      const [form] = await db
        .select({ ownerId: formsTable.ownerId })
        .from(formsTable)
        .where(eq(formsTable.id, req.params.formId))
        .limit(1)
        .execute();
      if (!form || form.ownerId !== context.user.id) {
        res.status(404).json({ message: "Form not found" });
        return;
      }

      const userConnections = connectionCounts.get(context.user.id) ?? 0;
      if (userConnections >= MAX_CONNECTIONS_PER_USER) {
        res.status(429).json({ message: "Too many analytics connections" });
        return;
      }

      const userId = context.user.id;
      connectionCounts.set(userId, userConnections + 1);
      res.status(200);
      res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
      res.write(": connected\n\n");

      const unsubscribe = subscribeToAnalytics(req.params.formId, () => {
        res.write("data: update\n\n");
      });
      const heartbeat = setInterval(() => {
        res.write(": heartbeat\n\n");
      }, 25_000);
      heartbeat.unref?.();

      res.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
        const remaining = (connectionCounts.get(userId) ?? 1) - 1;
        if (remaining > 0) connectionCounts.set(userId, remaining);
        else connectionCounts.delete(userId);
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
