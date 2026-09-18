import { db, eq, and } from "@repo/db";
import { formPaymentsTable } from "@repo/db/schema";

type PaymentRowStatus = "paid" | "failed" | "refunded";

/**
 * Applies a verified Razorpay webhook event to the matching payment row.
 * Only updates rows still in the `created` state (or any row matched by
 * payment id) so an already captured payment is never downgraded.
 */
export async function applyRazorpayWebhookEvent(payload: {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string } };
    refund?: { entity?: { payment_id?: string } };
  };
}): Promise<{ handled: boolean; count: number }> {
  const event = payload.event ?? "";
  const paymentEntity = payload.payload?.payment?.entity;
  const refundEntity = payload.payload?.refund?.entity;

  let status: PaymentRowStatus | null = null;
  if (
    event === "payment.captured" ||
    event === "payment.authorized" ||
    event === "order.paid"
  ) {
    status = "paid";
  } else if (event === "payment.failed") {
    status = "failed";
  } else if (event === "payment.refunded" || event === "refund.processed") {
    status = "refunded";
  }

  if (!status) return { handled: false, count: 0 };

  const orderId = paymentEntity?.order_id;
  const paymentId = paymentEntity?.id ?? refundEntity?.payment_id;

  const change: {
    status?: "paid" | "failed" | "refunded";
    razorpayPaymentId?: string;
    paidAt?: Date;
  } = { status };
  if (paymentId) change.razorpayPaymentId = paymentId;
  if (status === "paid") change.paidAt = new Date();

  if (orderId) {
    const updated = await db
      .update(formPaymentsTable)
      .set(change)
      .where(
        and(
          eq(formPaymentsTable.razorpayOrderId, orderId),
          eq(formPaymentsTable.status, "created"),
        ),
      )
      .returning()
      .execute();
    if (updated.length > 0) {
      return { handled: true, count: updated.length };
    }
  }

  if (paymentId) {
    const updated = await db
      .update(formPaymentsTable)
      .set(change)
      .where(eq(formPaymentsTable.razorpayPaymentId, paymentId))
      .returning()
      .execute();
    return { handled: updated.length > 0, count: updated.length };
  }

  return { handled: false, count: 0 };
}