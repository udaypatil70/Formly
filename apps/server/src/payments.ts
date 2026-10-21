import { createHash } from "node:crypto";
import { Router } from "express";
import { logger } from "@repo/logger";
import { verifyRazorpayWebhookSignature } from "@repo/api/server/utils/razorpay";
import { applyRazorpayWebhookEvent } from "@repo/api/server/utils/payments";
import { applyRazorpaySubscriptionEvent } from "@repo/api/server/utils/subscriptions";
import {
  claimRazorpayWebhookEvent,
  completeRazorpayWebhookEvent,
  failRazorpayWebhookEvent,
  isSettledStatus,
} from "@repo/api/server/utils/razorpay-events";
import { emitPaymentTransitions } from "@repo/api/server/utils/webhooks";

/**
 * Razorpay webhook endpoint. Razorpay POSTs signed JSON events here
 * (payment.captured / payment.failed / subscription.activated /
 * subscription.cancelled, ...). The raw body is captured by the `verify`
 * hook on `express.json()` and verified against `x-razorpay-signature`
 * before any DB change happens.
 *
 * Every delivery is first claimed in `razorpay_webhook_events` using the
 * `x-razorpay-event-id` header. That makes retries and dashboard replays a
 * no-op, which is essential for one-way transitions like `payment.refunded`.
 */
export function paymentsRouter(): Router {
  const router = Router();

  router.post("/webhook", async (req, res) => {
    const signature =
      typeof req.headers["x-razorpay-signature"] === "string"
        ? req.headers["x-razorpay-signature"]
        : null;

    const rawBody: unknown = (req as Express.Request & { rawBody?: Buffer })
      .rawBody;
    const raw = Buffer.isBuffer(rawBody)
      ? rawBody.toString("utf8")
      : typeof rawBody === "string"
        ? rawBody
        : "";

    if (!verifyRazorpayWebhookSignature(raw, signature)) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const headerEventId = req.headers["x-razorpay-event-id"];
    // Razorpay always sends the header. The body hash is a defensive fallback
    // so a replay still cannot run twice if a proxy strips it.
    const eventId =
      (typeof headerEventId === "string" && headerEventId.trim().length > 0
        ? headerEventId.trim()
        : `body:${createHash("sha256").update(raw).digest("hex")}`
      ).slice(0, 255);

    const body: Record<string, unknown> =
      req.body && typeof req.body === "object"
        ? (req.body as Record<string, unknown>)
        : {};
    const event = typeof body.event === "string" ? body.event : "unknown";

    let claim;
    try {
      claim = await claimRazorpayWebhookEvent({ eventId, event, payload: body });
    } catch (error) {
      logger.error("Razorpay webhook claim failed", { error, eventId });
      return res.status(500).json({ error: "Internal server error" });
    }

    if (claim.kind === "duplicate") {
      // Settled duplicates are safe to acknowledge. An in-flight duplicate
      // must receive a non-2xx so Razorpay retries after the first attempt
      // either commits or is reclaimed as stale.
      const settled = isSettledStatus(claim.status);
      return res.status(settled ? 200 : 409).json({
        received: true,
        duplicate: true,
        status: claim.status,
      });
    }

    try {
      const paymentResult = await applyRazorpayWebhookEvent(body);
      if (paymentResult.handled) {
        // Refunds in particular happen entirely on Razorpay's side, so this is
        // the only place the app learns about them. A partial refund leaves
        // the row `paid`, so only forward rows that actually reached a new
        // terminal state.
        const isRefundEvent =
          body.event === "payment.refunded" || body.event === "refund.processed";
        const transitioned = isRefundEvent
          ? paymentResult.rows.filter((row) => row.status === "refunded")
          : paymentResult.rows;
        void emitPaymentTransitions(transitioned);
        await completeRazorpayWebhookEvent(claim.id, "processed");
        return res
          .status(200)
          .json({ received: true, handled: true, kind: "payment" });
      }

      const subscriptionResult = await applyRazorpaySubscriptionEvent(body);
      await completeRazorpayWebhookEvent(
        claim.id,
        subscriptionResult.handled ? "processed" : "ignored",
      );
      return res.status(200).json({
        received: true,
        handled: subscriptionResult.handled,
        kind: subscriptionResult.handled ? "subscription" : "unhandled",
      });
    } catch (error) {
      await failRazorpayWebhookEvent(claim.id, error).catch(() => undefined);
      logger.error("Razorpay webhook processing error", { error, eventId });
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
