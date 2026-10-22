import { logger } from "@repo/logger";
import { db } from "@repo/db";

type AnalyticsListener = () => void;

const listeners = new Map<string, Set<AnalyticsListener>>();

async function connectToDatabase() {
  return db.$client.connect();
}

type AnalyticsClient = Awaited<ReturnType<typeof connectToDatabase>>;

let connectedClient: AnalyticsClient | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

export function subscribeToAnalytics(
  formId: string,
  listener: AnalyticsListener,
): () => void {
  const subscribers = listeners.get(formId) ?? new Set<AnalyticsListener>();
  subscribers.add(listener);
  listeners.set(formId, subscribers);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) listeners.delete(formId);
  };
}

export async function startAnalyticsNotificationListener(): Promise<() => void> {
  stopped = false;

  const connect = async () => {
    if (stopped || connectedClient) return;
    try {
      const client = await connectToDatabase();
      connectedClient = client;
      await client.query("LISTEN formly_analytics");
      client.on("notification", (message) => {
        if (message.channel !== "formly_analytics" || !message.payload) return;
        for (const listener of listeners.get(message.payload) ?? []) listener();
      });
      client.on("error", (error) => {
        logger.error("analytics notification connection failed", { err: error });
        connectedClient?.release(true);
        connectedClient = null;
        scheduleReconnect();
      });
      logger.info("analytics notification listener started");
    } catch (error) {
      logger.error("could not start analytics notification listener", {
        err: error,
      });
      connectedClient?.release(true);
      connectedClient = null;
      scheduleReconnect();
    }
  };

  const scheduleReconnect = () => {
    if (stopped || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, 5_000);
    retryTimer.unref?.();
  };

  await connect();
  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    connectedClient?.release();
    connectedClient = null;
  };
}
