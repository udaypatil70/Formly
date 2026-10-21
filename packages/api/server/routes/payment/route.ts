import { createHash } from "node:crypto";
import { z } from "zod";
import {
  db,
  eq,
  and,
  desc,
  count,
  gte,
  lte,
  ilike,
  or,
  sql,
  type SQL,
} from "@repo/db";
import {
  fieldsTable,
  formsTable,
  formPaymentsTable,
} from "@repo/db/schema";
import { TRPCError } from "@trpc/server";
import { toMinorUnits } from "@repo/validators";

import { router, publicProcedure, protectedProcedure } from "../../trpc";
import { isAdminUser } from "../../utils/admin";
import { rateLimit } from "../../utils/rate-limit";
import { verifyPassword } from "../../utils/password";
import {
  createRazorpayOrder,
  createRazorpayRefund,
  razorpayConfig,
  razorpayConfigured,
} from "../../utils/razorpay";
import { getFieldsForForm } from "../../utils/form";
import { emitPaymentTransitions } from "../../utils/webhooks";
import { assertFormOwner } from "../form/route";
import type { SelectForm } from "@repo/db/schema";

const TAGS = ["Payments"];

const paymentStatus = z.enum(["created", "paid", "failed", "refunded"]);

const createOrderInput = z.object({
  slug: z.string().min(1).max(255),
  password: z.string().optional(),
  fieldId: z.string().uuid(),
});

const createOrderOutput = z.object({
  orderId: z.string(),
  /** Whole currency units, for display in Checkout. */
  amount: z.number().int().positive(),
  /** Smallest currency unit, for the Razorpay checkout payload. */
  amountPaise: z.number().int().positive(),
  currency: z.string(),
  keyId: z.string(),
});

const listInput = z.object({
  formId: z.string().uuid(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  status: paymentStatus.optional(),
  fieldId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  /** ISO timestamps; invalid values are ignored rather than crashing a list. */
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
});

const paymentViewOutput = z.object({
  id: z.string().uuid(),
  fieldId: z.string().uuid(),
  status: paymentStatus,
  amountPaise: z.number(),
  refundedAmountPaise: z.number(),
  currency: z.string(),
  fieldLabel: z.string().nullable(),
  orderId: z.string(),
  paymentId: z.string().nullable(),
  refundId: z.string().nullable(),
  responseId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  paidAt: z.string().nullable().optional(),
  refundedAt: z.string().nullable().optional(),
});

const totalsOutput = z.object({
  count: z.number(),
  paidCount: z.number(),
  pendingCount: z.number(),
  refundedCount: z.number(),
  failedCount: z.number(),
  paidAmountPaise: z.number(),
  pendingAmountPaise: z.number(),
  refundedAmountPaise: z.number(),
});

const refundInput = z.object({
  /** `form_payments.id`, not the Razorpay id. */
  id: z.string().uuid(),
  /** Optional partial refund, in minor units (paise/cents). */
  amountPaise: z.number().int().positive().optional(),
});

const refundOutput = z.object({
  success: z.boolean(),
  status: paymentStatus,
  refundedAmountPaise: z.number(),
  refundId: z.string().nullable(),
});

/** Hash an IP for storage/privacy (mirrors the public router). */
function hashIp(ip: string): string {
  return createHash("sha256").update(`formly-salt:${ip}`).digest("hex");
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export const paymentRouter = router({
  /**
   * Creates a Razorpay order for a payment field on a published form.
   * Does not charge anything — the visitor completes the payment in the
   * Razorpay Checkout using the returned `orderId`.
   */
  createOrder: publicProcedure
    .meta({
      openapi: { method: "POST", path: "/payments/create-order", tags: TAGS },
    })
    .input(createOrderInput)
    .output(createOrderOutput)
    .mutation(async ({ ctx, input }) => {
      const ipKey = ctx.ip ?? "unknown";
      const limited = await rateLimit(`pay:order:${hashIp(ipKey)}`, {
        limit: 10,
        windowMs: 60_000,
      });
      if (limited.limited) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests, please try again later",
        });
      }

      if (!razorpayConfigured()) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message:
            "Payments are not configured yet. The form owner needs to set up payment keys.",
        });
      }

      const form = await db
        .select()
        .from(formsTable)
        .where(
          and(
            eq(formsTable.slug, input.slug),
            eq(formsTable.status, "published"),
            eq(formsTable.archived, false),
          ),
        )
        .limit(1)
        .execute();
      if (form.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Form not found" });
      }
      const published: SelectForm = form[0]!;

      const stored = published.settings?.password;
      if (stored) {
        if (input.password == null || input.password === "") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This form is password protected",
          });
        }
        if (!(await verifyPassword(input.password, stored))) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Incorrect password",
          });
        }
      }

      const { fields } = await getFieldsForForm(published.id);
      const field = fields.find(
        (f) => f.id === input.fieldId && f.type === "payment",
      );
      if (!field) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Payment field not found on this form",
        });
      }

      const amount = field.validationRules?.amount;
      if (!amount || amount <= 0 || !Number.isFinite(amount)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This payment field has no amount configured",
        });
      }

      const currency = (field.validationRules?.currency ?? "INR").toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This payment field has an invalid currency",
        });
      }

      // Convert through the shared currency helper: JPY has no minor unit and
      // KWD has three, so a hard-coded `amount * 100` would be wrong for both.
      const amountPaise = toMinorUnits(amount, currency);
      if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This payment field has an invalid amount",
        });
      }

      const order = await createRazorpayOrder({
        amountPaise,
        currency,
        receipt: `form_${published.id.slice(0, 8)}_${Date.now()}`.slice(0, 40),
      });

      await db
        .insert(formPaymentsTable)
        .values({
          formId: published.id,
          fieldId: field.id,
          razorpayOrderId: order.id,
          amountPaise: order.amountPaise,
          currency: order.currency,
          metadata: { fieldLabel: field.label, title: published.title },
        })
        .execute();

      const config = razorpayConfig()!;
      return {
        orderId: order.id,
        amount,
        amountPaise: order.amountPaise,
        currency: order.currency,
        keyId: config.keyId,
      };
    }),

  /**
   * Payment ledger for a form (owner only).
   *
   * `payments` is paginated and filterable; `totals` is computed with SQL
   * aggregates over every row, so the "collected" figure stays correct once a
   * form has more than one page of orders.
   */
  list: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/payments", tags: TAGS } })
    .input(listInput)
    .output(
      z.object({
        payments: z.array(paymentViewOutput),
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
        totals: totalsOutput,
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertFormOwner(input.formId, ctx.user.id);

      const conditions: SQL[] = [eq(formPaymentsTable.formId, input.formId)];
      if (input.status) {
        conditions.push(eq(formPaymentsTable.status, input.status));
      }
      if (input.fieldId) {
        conditions.push(eq(formPaymentsTable.fieldId, input.fieldId));
      }

      const from = parseDate(input.from);
      const to = parseDate(input.to);
      if (from) conditions.push(gte(formPaymentsTable.createdAt, from));
      if (to) conditions.push(lte(formPaymentsTable.createdAt, to));

      const search = input.search?.trim();
      if (search) {
        const escaped = search.replace(/[\\%_]/g, (c) => `\\${c}`);
        const pattern = `%${escaped}%`;
        conditions.push(
          or(
            ilike(formPaymentsTable.razorpayOrderId, pattern),
            ilike(formPaymentsTable.razorpayPaymentId, pattern),
          )!,
        );
      }

      const where = and(...conditions);
      const offset = (input.page - 1) * input.pageSize;

      const [rows, countRows, totalsRows] = await Promise.all([
        db
          .select({
            payment: formPaymentsTable,
            fieldLabel: fieldsTable.label,
          })
          .from(formPaymentsTable)
          .innerJoin(fieldsTable, eq(fieldsTable.id, formPaymentsTable.fieldId))
          .where(where)
          .orderBy(desc(formPaymentsTable.createdAt))
          .limit(input.pageSize)
          .offset(offset)
          .execute(),
        db
          .select({ total: count() })
          .from(formPaymentsTable)
          .where(where)
          .execute(),
        db
          .select({
            count: count(),
            paidCount: sql<number>`count(*) filter (where ${formPaymentsTable.status} = 'paid')`.mapWith(
              Number,
            ),
            pendingCount: sql<number>`count(*) filter (where ${formPaymentsTable.status} = 'created')`.mapWith(
              Number,
            ),
            refundedCount: sql<number>`count(*) filter (where ${formPaymentsTable.status} = 'refunded')`.mapWith(
              Number,
            ),
            failedCount: sql<number>`count(*) filter (where ${formPaymentsTable.status} = 'failed')`.mapWith(
              Number,
            ),
            paidAmountPaise: sql<number>`coalesce(sum(${formPaymentsTable.amountPaise}) filter (where ${formPaymentsTable.status} = 'paid'), 0)`.mapWith(
              Number,
            ),
            pendingAmountPaise: sql<number>`coalesce(sum(${formPaymentsTable.amountPaise}) filter (where ${formPaymentsTable.status} = 'created'), 0)`.mapWith(
              Number,
            ),
            // Includes partial refunds on rows that are still `paid`. Legacy
            // refunds written before the column existed have a zero refunded
            // amount; fall back to the full amount for those rows.
            refundedAmountPaise: sql<number>`coalesce(sum(case when ${formPaymentsTable.refundedAmountPaise} > 0 then ${formPaymentsTable.refundedAmountPaise} when ${formPaymentsTable.status} = 'refunded' then ${formPaymentsTable.amountPaise} else 0 end), 0)`.mapWith(
              Number,
            ),
          })
          .from(formPaymentsTable)
          .where(eq(formPaymentsTable.formId, input.formId))
          .execute(),
      ]);

      const totalsRow = totalsRows[0];

      return {
        payments: rows.map(({ payment, fieldLabel }) => {
          const metadataLabel =
            typeof payment.metadata?.fieldLabel === "string"
              ? payment.metadata.fieldLabel
              : null;
          return {
            id: payment.id,
            fieldId: payment.fieldId,
            status: payment.status,
            amountPaise: payment.amountPaise,
            refundedAmountPaise: payment.refundedAmountPaise,
            currency: payment.currency,
            fieldLabel: metadataLabel ?? fieldLabel ?? null,
            orderId: payment.razorpayOrderId,
            paymentId: payment.razorpayPaymentId,
            refundId: payment.razorpayRefundId,
            responseId: payment.responseId ?? null,
            createdAt: payment.createdAt.toISOString(),
            paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
            refundedAt: payment.refundedAt
              ? payment.refundedAt.toISOString()
              : null,
          };
        }),
        total: Number(countRows[0]?.total ?? 0),
        page: input.page,
        pageSize: input.pageSize,
        totals: {
          count: Number(totalsRow?.count ?? 0),
          paidCount: totalsRow?.paidCount ?? 0,
          pendingCount: totalsRow?.pendingCount ?? 0,
          refundedCount: totalsRow?.refundedCount ?? 0,
          failedCount: totalsRow?.failedCount ?? 0,
          paidAmountPaise: totalsRow?.paidAmountPaise ?? 0,
          pendingAmountPaise: totalsRow?.pendingAmountPaise ?? 0,
          refundedAmountPaise: totalsRow?.refundedAmountPaise ?? 0,
        },
      };
    }),

  /**
   * Refunds a captured payment through Razorpay (owner or admin).
   *
   * Partial refunds are supported; the row stays `paid` until the full amount
   * has been returned, at which point it becomes `refunded`. The status guard
   * keeps two concurrent refund clicks from over-refunding.
   */
  refund: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/payments/refund", tags: TAGS } })
    .input(refundInput)
    .output(refundOutput)
    .mutation(async ({ ctx, input }) => {
      const limited = await rateLimit(`pay:refund:${ctx.user.id}`, {
        limit: 10,
        windowMs: 60_000,
      });
      if (limited.limited) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many refund attempts, please try again later",
        });
      }

      const [row] = await db
        .select({
          payment: formPaymentsTable,
          ownerId: formsTable.ownerId,
        })
        .from(formPaymentsTable)
        .innerJoin(formsTable, eq(formsTable.id, formPaymentsTable.formId))
        .where(eq(formPaymentsTable.id, input.id))
        .limit(1)
        .execute();

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });
      }
      if (row.ownerId !== ctx.user.id && !isAdminUser(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this payment",
        });
      }
      if (row.payment.status !== "paid") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only captured payments can be refunded",
        });
      }
      if (!row.payment.razorpayPaymentId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This payment has no Razorpay payment id",
        });
      }
      if (!razorpayConfigured()) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Payments are not configured on this server",
        });
      }

      const alreadyRefunded = row.payment.refundedAmountPaise;
      const refundable = row.payment.amountPaise - alreadyRefunded;
      if (refundable <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This payment has already been fully refunded",
        });
      }

      const amountPaise = input.amountPaise ?? refundable;
      if (amountPaise > refundable) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Refund amount exceeds the remaining balance",
        });
      }

      let refund;
      try {
        refund = await createRazorpayRefund({
          paymentId: row.payment.razorpayPaymentId,
          amountPaise,
          notes: {
            paymentRowId: row.payment.id,
            formId: row.payment.formId,
          },
        });
      } catch {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "Razorpay could not process this refund. Please try again.",
        });
      }

      const nextRefunded = alreadyRefunded + amountPaise;
      const fullyRefunded = nextRefunded >= row.payment.amountPaise;

      const [updated] = await db
        .update(formPaymentsTable)
        .set({
          refundedAmountPaise: nextRefunded,
          razorpayRefundId: refund.id,
          status: fullyRefunded ? "refunded" : "paid",
          refundedAt: new Date(),
          ...(fullyRefunded
            ? { metadata: { ...row.payment.metadata, refunded: true } }
            : {}),
        })
        .where(
          and(
            eq(formPaymentsTable.id, row.payment.id),
            eq(formPaymentsTable.status, "paid"),
            eq(formPaymentsTable.refundedAmountPaise, alreadyRefunded),
          ),
        )
        .returning()
        .execute();

      if (!updated) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This payment changed while the refund was processed. Refresh and try again.",
        });
      }

      if (fullyRefunded) {
        void emitPaymentTransitions([updated]);
      }

      return {
        success: true,
        status: updated.status,
        refundedAmountPaise: updated.refundedAmountPaise,
        refundId: updated.razorpayRefundId,
      };
    }),
});
