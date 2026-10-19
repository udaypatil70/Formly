import { db, eq, inArray } from "@repo/db";
import {
  formWebhooksTable,
  formsTable,
  type SelectForm,
  type SelectFormWebhook,
} from "@repo/db/schema";
import type { Field } from "@repo/validators";
import { webhookSubscribesTo } from "@repo/validators";
import { enqueueDeliveries } from "./webhook-delivery";

/**
 * Event emission for form webhooks.
 *
 * `emitWebhookEvent` is the only entry point: it resolves which hooks want the
 * event, records one delivery per hook, and hands off to the delivery engine.
 * It never awaits the network, so an emitter can call it inline on a hot path
 * (a submission) without the caller's latency depending on a stranger's
 * endpoint.
 */

function formatAnswerValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    const file = value as { name?: string };
    return file.name ?? "";
  }
  return String(value);
}

export interface ResponseEventContext {
  form: SelectForm;
  fields: Field[];
  answers: Record<string, unknown>;
  responseId: string;
  submittedAt: string;
}

export interface PaymentEventContext {
  form: SelectForm;
  paymentId: string;
  orderId: string | null;
  razorpayPaymentId: string | null;
  amountPaise: number;
  currency: string;
  status: "paid" | "refunded";
  responseId: string | null;
  occurredAt: string;
}

export interface FormLifecycleEventContext {
  form: SelectForm;
  previousStatus: string | null;
  occurredAt: string;
}

export interface DraftEventContext {
  form: SelectForm;
  draftId: string;
  currentStep: number;
  answeredFields: number;
  occurredAt: string;
}

function formEnvelope(form: SelectForm) {
  return {
    id: form.id,
    title: form.title,
    slug: form.slug,
  };
}

function answerList(fields: Field[], answers: Record<string, unknown>) {
  return fields
    .filter((f) => f.type !== "page_break")
    .map((field) => ({
      fieldId: field.id,
      label: field.label,
      value: formatAnswerValue(answers[field.id]),
    }));
}

function buildResponsePayload(
  event: string,
  ctx: ResponseEventContext,
): Record<string, unknown> {
  return {
    event,
    occurredAt: ctx.submittedAt,
    form: formEnvelope(ctx.form),
    response: {
      id: ctx.responseId,
      submittedAt: ctx.submittedAt,
      answers: answerList(ctx.fields, ctx.answers),
    },
  };
}

function buildPaymentPayload(
  event: string,
  ctx: PaymentEventContext,
): Record<string, unknown> {
  return {
    event,
    occurredAt: ctx.occurredAt,
    form: formEnvelope(ctx.form),
    payment: {
      id: ctx.paymentId,
      orderId: ctx.orderId,
      providerPaymentId: ctx.razorpayPaymentId,
      amountPaise: ctx.amountPaise,
      // Minor units are the source of truth; the decimal form is a
      // convenience for receivers that log amounts in major units.
      amount: ctx.amountPaise / 100,
      currency: ctx.currency,
      status: ctx.status,
      responseId: ctx.responseId,
    },
  };
}

function buildFormLifecyclePayload(
  event: string,
  ctx: FormLifecycleEventContext,
): Record<string, unknown> {
  return {
    event,
    occurredAt: ctx.occurredAt,
    form: {
      ...formEnvelope(ctx.form),
      status: ctx.form.status,
      previousStatus: ctx.previousStatus,
      visibility: ctx.form.visibility,
      updatedAt: ctx.form.updatedAt ? ctx.form.updatedAt.toISOString() : null,
    },
  };
}

function buildDraftPayload(
  event: string,
  ctx: DraftEventContext,
): Record<string, unknown> {
  return {
    event,
    occurredAt: ctx.occurredAt,
    form: formEnvelope(ctx.form),
    draft: {
      id: ctx.draftId,
      currentStep: ctx.currentStep,
      answeredFields: ctx.answeredFields,
    },
  };
}

export function buildWebhookPayload(
  event: string,
  ctx:
    | ResponseEventContext
    | PaymentEventContext
    | FormLifecycleEventContext
    | DraftEventContext,
): Record<string, unknown> {
  switch (event) {
    case "response.created":
    case "response.updated":
      return buildResponsePayload(event, ctx as ResponseEventContext);
    case "payment.paid":
    case "payment.refunded":
      return buildPaymentPayload(event, ctx as PaymentEventContext);
    case "form.published":
    case "form.unpublished":
      return buildFormLifecyclePayload(
        event,
        ctx as FormLifecycleEventContext,
      );
    case "draft.saved":
      return buildDraftPayload(event, ctx as DraftEventContext);
    default:
      return { event, occurredAt: new Date().toISOString(), form: null };
  }
}

/** Active hooks on a form, narrowed to those subscribed to `event`. */
async function subscribedHooks(
  formId: string,
  event: string,
): Promise<SelectFormWebhook[]> {
  const hooks = await db
    .select()
    .from(formWebhooksTable)
    .where(eq(formWebhooksTable.formId, formId))
    .execute();

  return hooks.filter(
    (hook) => hook.active && webhookSubscribesTo(hook.events, event),
  );
}

/**
 * Records a delivery for every hook subscribed to `event` and fires the first
 * attempt in the background.
 *
 * Returns the created delivery ids so a caller that wants to block (the
 * `webhook.test` procedure) can await them.
 */
export async function emitWebhookEvent(
  event: string,
  ctx: Parameters<typeof buildWebhookPayload>[1],
): Promise<string[]> {
  try {
    const hooks = await subscribedHooks(ctx.form.id, event);
    if (hooks.length === 0) return [];
    const payload = buildWebhookPayload(event, ctx);
    return await enqueueDeliveries({ hooks, event, payload });
  } catch (error) {
    // An emitter runs after the user's data is already committed; a webhook
    // bookkeeping failure must never surface as a failed submission.
    console.error(`[webhooks] failed to emit ${event}`, error);
    return [];
  }
}

/**
 * Fire-and-forget wrapper for call sites on a request path.
 */
export function triggerWebhooks(
  event: string,
  ctx: Parameters<typeof buildWebhookPayload>[1],
): void {
  void emitWebhookEvent(event, ctx);
}

// ─── Convenience emitters ─────────────────────────────────

export function emitResponseCreated(ctx: ResponseEventContext) {
  triggerWebhooks("response.created", ctx);
}

export function emitResponseUpdated(ctx: ResponseEventContext) {
  triggerWebhooks("response.updated", ctx);
}

export function emitPaymentEvent(
  event: "payment.paid" | "payment.refunded",
  ctx: PaymentEventContext,
) {
  triggerWebhooks(event, ctx);
}

export function emitFormLifecycle(
  event: "form.published" | "form.unpublished",
  ctx: FormLifecycleEventContext,
) {
  triggerWebhooks(event, ctx);
}

export function emitDraftSaved(ctx: DraftEventContext) {
  triggerWebhooks("draft.saved", ctx);
}

// ─── Payment transitions (Razorpay webhook) ───────────────

/**
 * Emits `payment.paid` / `payment.refunded` for every payment row an inbound
 * Razorpay event just moved.
 *
 * Reached only from the signed Razorpay webhook, so the rows are already
 * verified by the time this runs. A form whose owner has no matching webhook
 * simply produces no deliveries.
 */
export async function emitPaymentTransitions(
  rows: Array<{
    id: string;
    formId: string;
    razorpayOrderId: string | null;
    razorpayPaymentId: string | null;
    amountPaise: number;
    currency: string;
    status: string;
    responseId: string | null;
  }>,
): Promise<void> {
  const pending = rows.flatMap((row) => {
    const event =
      row.status === "paid"
        ? ("payment.paid" as const)
        : row.status === "refunded"
          ? ("payment.refunded" as const)
          : null;
    return event ? [{ row, event }] : [];
  });
  if (pending.length === 0) return;

  // One query for all the forms, rather than one per payment row — a single
  // Razorpay event can move several payments.
  const formIds = [...new Set(pending.map(({ row }) => row.formId))];
  const forms = await db
    .select()
    .from(formsTable)
    .where(inArray(formsTable.id, formIds))
    .execute();
  const formsById = new Map(forms.map((form) => [form.id, form]));

  const occurredAt = new Date().toISOString();

  await Promise.all(
    pending.map(({ row, event }) => {
      const form = formsById.get(row.formId);
      if (!form) return Promise.resolve();
      return emitWebhookEvent(event, {
        form,
        paymentId: row.id,
        orderId: row.razorpayOrderId,
        razorpayPaymentId: row.razorpayPaymentId,
        amountPaise: row.amountPaise,
        currency: row.currency,
        status: event === "payment.paid" ? "paid" : "refunded",
        responseId: row.responseId,
        occurredAt,
      });
    }),
  );
}

/**
 * A realistic sample payload for `webhook.test` / the preview panel.
 *
 * Built from the real shape builders rather than a hand-written literal so the
 * preview cannot drift from what a live delivery actually contains.
 */
export function samplePayload(
  event: string,
  form: SelectForm | null,
): Record<string, unknown> {
  const now = new Date().toISOString();
  const base = {
    id: form?.id ?? "00000000-0000-4000-8000-000000000000",
    title: form?.title ?? "Sample form",
    slug: form?.slug ?? "sample-form",
  };

  if (event === "payment.paid" || event === "payment.refunded") {
    return {
      event,
      occurredAt: now,
      form: base,
      payment: {
        id: "00000000-0000-4000-8000-000000000000",
        orderId: "order_00000000000000",
        providerPaymentId: "pay_00000000000000",
        amountPaise: 49900,
        amount: 499,
        currency: "INR",
        status: event === "payment.paid" ? "paid" : "refunded",
        responseId: "00000000-0000-4000-8000-000000000000",
      },
    };
  }

  if (event === "form.published" || event === "form.unpublished") {
    return {
      event,
      occurredAt: now,
      form: {
        ...base,
        status: event === "form.published" ? "published" : "unpublished",
        previousStatus: event === "form.published" ? "draft" : "published",
        visibility: form?.visibility ?? "public",
        updatedAt: now,
      },
    };
  }

  if (event === "draft.saved") {
    return {
      event,
      occurredAt: now,
      form: base,
      draft: {
        id: "00000000-0000-4000-8000-000000000000",
        currentStep: 1,
        answeredFields: 3,
      },
    };
  }

  return {
    event,
    occurredAt: now,
    form: base,
    response: {
      id: "00000000-0000-4000-8000-000000000000",
      submittedAt: now,
      answers: [
        { fieldId: "00000000-0000-4000-8000-000000000000", label: "Sample", value: "Hello" },
      ],
    },
  };
}
