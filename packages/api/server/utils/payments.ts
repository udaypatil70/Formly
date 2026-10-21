import { db, eq, and, inArray, sql, type SQL } from "@repo/db";
import { formPaymentsTable } from "@repo/db/schema";

type PaymentStatus = "created" | "paid" | "failed" | "refunded";

/**
 * States an event may move a row *out of*.
 *
 * Webhooks are at-least-once and can also arrive out of order, so every
 * transition is explicitly one-way:
 *
 *   paid     ← created | failed   (a successful retry fixes a failed attempt)
 *   failed   ← created            (never downgrade a captured payment)
 *   refunded ← paid               (never refund a row that was never paid)
 *
 * The same guard is applied to both lookup paths (order id and payment id) so
 * a replayed `payment.failed` cannot flip a paid row through the fallback.
 */
const ALLOWED_FROM: Record<Exclude<PaymentStatus, "created">, PaymentStatus[]> =
  {
    paid: ["created", "failed"],
    failed: ["created"],
    refunded: ["paid"],
  };

/** Shape needed to build a `payment.*` webhook payload downstream. */
export interface TransitionedPayment {
  id: string;
  formId: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  amountPaise: number;
  currency: string;
  status: string;
  responseId: string | null;
}

/**
 * Applies a verified Razorpay webhook event to the matching payment row.
 *
 * Rows are matched by order id first; a payment id fallback covers events that
 * carry no order (e.g. refund entities). Both paths use `ALLOWED_FROM`, so a
 * stale or replayed event is a no-op instead of a downgrade.
 *
 * Returns the rows it actually moved so the caller can emit `payment.paid` /
 * `payment.refunded` — without that return value a refund would be invisible
 * to the owner's integration, since nothing else in the app sees the
 * transition happen.
 */
export async function applyRazorpayWebhookEvent(payload: {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        /** Cumulative refunded amount across every refund on the payment. */
        amount_refunded?: number;
      };
    };
    refund?: {
      entity?: {
        id?: string;
        payment_id?: string;
        amount?: number;
        currency?: string;
      };
    };
  };
}): Promise<{ handled: boolean; count: number; rows: TransitionedPayment[] }> {
  const event = payload.event ?? "";
  const paymentEntity = payload.payload?.payment?.entity;
  const refundEntity = payload.payload?.refund?.entity;

  let status: Exclude<PaymentStatus, "created"> | null = null;
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

  if (!status) return { handled: false, count: 0, rows: [] };

  const orderId = paymentEntity?.order_id;
  const paymentId = paymentEntity?.id ?? refundEntity?.payment_id;

  const change: {
    status?: Exclude<PaymentStatus, "created"> | SQL<unknown>;
    razorpayPaymentId?: string;
    paidAt?: Date;
    refundedAt?: Date;
    razorpayRefundId?: string;
    refundedAmountPaise?: number | SQL<unknown>;
  } = { status };
  if (paymentId) change.razorpayPaymentId = paymentId;
  if (status === "paid") change.paidAt = new Date();
  if (status === "refunded") {
    change.refundedAt = new Date();
    if (refundEntity?.id) change.razorpayRefundId = refundEntity.id;
    // Prefer the cumulative figure from the payment entity so out-of-order
    // partial refunds cannot move the stored total backwards. GREATEST also
    // protects the total written by our own refund mutation before its
    // webhook arrives.
    const refundedAmount = paymentEntity?.amount_refunded ?? refundEntity?.amount;
    if (typeof refundedAmount === "number") {
      change.refundedAmountPaise = sql`greatest(${formPaymentsTable.refundedAmountPaise}, ${refundedAmount})`;
      // Partial refunds must not flip the whole row: only mark it refunded
      // once the cumulative amount covers the order.
      change.status = sql`case when greatest(${formPaymentsTable.refundedAmountPaise}, ${refundedAmount}) >= ${formPaymentsTable.amountPaise} then 'refunded'::payment_status else 'paid'::payment_status end`;
    } else {
      change.refundedAmountPaise = sql`${formPaymentsTable.amountPaise}`;
    }
  }

  const allowedFrom = ALLOWED_FROM[status];

  if (orderId) {
    const updated = await db
      .update(formPaymentsTable)
      .set(change)
      .where(
        and(
          eq(formPaymentsTable.razorpayOrderId, orderId),
          inArray(formPaymentsTable.status, allowedFrom),
        ),
      )
      .returning()
      .execute();
    if (updated.length > 0) {
      return { handled: true, count: updated.length, rows: updated };
    }
  }

  if (paymentId) {
    const updated = await db
      .update(formPaymentsTable)
      .set(change)
      .where(
        and(
          eq(formPaymentsTable.razorpayPaymentId, paymentId),
          inArray(formPaymentsTable.status, allowedFrom),
        ),
      )
      .returning()
      .execute();
    return {
      handled: updated.length > 0,
      count: updated.length,
      rows: updated,
    };
  }

  return { handled: false, count: 0, rows: [] };
}