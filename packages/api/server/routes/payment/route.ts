import { createHash } from "node:crypto";
import { z } from "zod";
import { db, eq, and } from "@repo/db";
import { formsTable, formPaymentsTable } from "@repo/db/schema";
import { TRPCError } from "@trpc/server";

import { router, publicProcedure } from "../../trpc";
import { rateLimit } from "../../utils/rate-limit";
import { verifyPassword } from "../../utils/password";
import {
  createRazorpayOrder,
  razorpayConfig,
  razorpayConfigured,
} from "../../utils/razorpay";
import { getFieldsForForm } from "../../utils/form";
import type { SelectForm } from "@repo/db/schema";

const TAGS = ["Payments"];

const createOrderInput = z.object({
  slug: z.string().min(1).max(255),
  password: z.string().optional(),
  fieldId: z.string().uuid(),
});

const createOrderOutput = z.object({
  orderId: z.string(),
  amount: z.number().int().positive(),
  currency: z.string(),
  keyId: z.string(),
});

/** Hash an IP for storage/privacy (mirrors the public router). */
function hashIp(ip: string): string {
  return createHash("sha256").update(`formforge-salt:${ip}`).digest("hex");
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
        if (!verifyPassword(input.password, stored)) {
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
      if (!amount || amount <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This payment field has no amount configured",
        });
      }

      const currency = (field.validationRules?.currency ?? "INR").toUpperCase();

      const order = await createRazorpayOrder({
        amountPaise: amount * 100,
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
        currency: order.currency,
        keyId: config.keyId,
      };
    }),
});