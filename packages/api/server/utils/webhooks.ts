import { createHmac } from "node:crypto";
import { db, eq } from "@repo/db";
import {
  formWebhooksTable,
  type SelectForm,
} from "@repo/db/schema";
import type { Field } from "@repo/validators";

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

export interface WebhookEventContext {
  form: SelectForm;
  fields: Field[];
  answers: Record<string, unknown>;
  responseId: string;
  submittedAt: string;
}

type DeliverResult =
  | { ok: true; status: number }
  | { ok: false; status: number; error: string };

async function deliver(
  url: string,
  secret: string | null,
  payload: unknown,
): Promise<DeliverResult> {
  try {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Formly-Webhooks/1.0",
    };
    if (secret) {
      const signature = createHmac("sha256", secret)
        .update(body)
        .digest("hex");
      headers["x-formly-signature"] = `sha256=${signature}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status} ${response.statusText}`,
      };
    }
    return { ok: true, status: response.status };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "Delivery failed",
    };
  }
}

function buildPayload(event: string, ctx: WebhookEventContext) {
  return {
    event,
    form: {
      id: ctx.form.id,
      title: ctx.form.title,
      slug: ctx.form.slug,
    },
    response: {
      id: ctx.responseId,
      submittedAt: ctx.submittedAt,
      answers: ctx.fields
        .filter((f) => f.type !== "page_break")
        .map((field) => ({
          fieldId: field.id,
          label: field.label,
          value: formatAnswerValue(ctx.answers[field.id]),
        })),
    },
  };
}

/**
 * Fire every active webhook for a form with an HMAC-signed payload.
 * Fire-and-forget: a delivery failure never affects the stored response.
 */
export async function triggerWebhooks(ctx: WebhookEventContext) {
  const hooks = await db
    .select()
    .from(formWebhooksTable)
    .where(eq(formWebhooksTable.formId, ctx.form.id))
    .execute();

  for (const hook of hooks) {
    if (!hook.active) continue;
    const payload = buildPayload("response.created", ctx);
    const result = await deliver(hook.url, hook.secret, payload);
    await db
      .update(formWebhooksTable)
      .set({
        lastStatus: result.ok ? result.status : result.status || null,
        lastError: result.ok ? null : result.error,
        lastTriggeredAt: new Date(),
      })
      .where(eq(formWebhooksTable.id, hook.id))
      .execute()
      .catch(() => undefined);
  }
}