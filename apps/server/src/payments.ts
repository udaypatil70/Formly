import { Router } from "express";
import { logger } from "@repo/logger";
import { verifyRazorpayWebhookSignature } from "@repo/api/server/utils/razorpay";
import { applyRazorpayWebhookEvent } from "@repo/api/server/utils/payments";

/**
 * Razorpay webhook endpoint. Razorpay POSTs signed JSON events here
 * (payment.captured / payment.failed / refund.processed, ...). The raw body
 * is captured by the `verify` hook on `express.json()` and verified against
 * `x-razorpay-signature` before any DB change happens.
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

    try {
      const result = await applyRazorpayWebhookEvent(req.body ?? {});
      return res
        .status(200)
        .json({ received: true, handled: result.handled });
    } catch (error) {
      logger.error("Razorpay webhook processing error", { error });
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}