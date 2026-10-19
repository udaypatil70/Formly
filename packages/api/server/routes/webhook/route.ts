import { z } from "zod";
import { db, eq, and, count, desc } from "@repo/db";
import {
  formWebhooksTable,
  formWebhookDeliveriesTable,
  formsTable,
} from "@repo/db/schema";
import { TRPCError } from "@trpc/server";
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_GROUPS,
  WEBHOOK_EVENT_ALL,
  normalizeWebhookEvents,
} from "@repo/validators";
import { router, protectedProcedure } from "../../trpc";
import { assertFormOwner } from "../form/route";
import { assertPublicHttpUrl, SsrfBlockedError } from "../../utils/ssrf";
import {
  assertWebhookQuota,
  getUserEntitlements,
  planAllowsFeature,
} from "../../utils/plans";
import {
  countDeliveries,
  deliverDeliveries,
  generateWebhookSecret,
  isRetryableStatus,
  redeliver,
  safeSecretPreview,
  signatureForStoredBody,
} from "../../utils/webhook-delivery";
import { samplePayload } from "../../utils/webhooks";

const TAGS = ["Webhooks"];

const deliveryStatus = z.enum(["pending", "success", "retrying", "dead"]);

/** Subscription list: real event names, or the wildcard. */
const eventsInput = z
  .array(z.string().max(50))
  .max(WEBHOOK_EVENTS.length + 1)
  .default(["response.created"]);

export const webhookOutput = z.object({
  id: z.string().uuid(),
  formId: z.string().uuid(),
  url: z.string(),
  /**
   * The secret itself is never part of this shape — it is returned exactly
   * once, by `create`, `rotateSecret` or `revealSecret`.
   */
  hasSecret: z.boolean(),
  secretPreview: z.string().nullable(),
  secretRotatedAt: z.string().nullable(),
  events: z.array(z.string()),
  active: z.boolean(),
  createdAt: z.string(),
  // `serialize` always sets these three, so they are not optional here.
  lastStatus: z.number().int().nullable(),
  lastError: z.string().nullable(),
  lastTriggeredAt: z.string().nullable(),
  consecutiveFailures: z.number().int(),
  autoDisabledAt: z.string().nullable(),
  autoDisabledReason: z.string().nullable(),
  /** Delivery totals per status, for the badge on the list row. */
  deliveryCounts: z.record(z.string(), z.number()),
});

export const webhookWithSecretOutput = webhookOutput.extend({
  /** Shown once after creation or rotation; never returned by `list`. */
  secret: z.string(),
});

const deliveryOutput = z.object({
  id: z.string().uuid(),
  webhookId: z.string().uuid(),
  event: z.string(),
  status: deliveryStatus,
  requestBody: z.record(z.string(), z.unknown()),
  url: z.string(),
  responseStatus: z.number().int().nullable(),
  responseBody: z.string().nullable(),
  error: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  attempt: z.number().int(),
  maxAttempts: z.number().int(),
  nextRetryAt: z.string().nullable(),
  isTest: z.boolean(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});

const listInput = z.object({ formId: z.string().uuid() });

const createInput = z.object({
  formId: z.string().uuid(),
  url: z.string().url("Enter a valid HTTPS URL"),
  secret: z.string().max(255).optional(),
  events: eventsInput,
  active: z.boolean().default(true),
});

const updateInput = z.object({
  id: z.string().uuid(),
  url: z.string().url("Enter a valid HTTPS URL").optional(),
  events: eventsInput.optional(),
  active: z.boolean().optional(),
});

const idInput = z.object({ id: z.string().uuid() });

const deliveriesInput = z.object({
  // Must be named `id` to match the `{id}` segment in the OpenAPI path.
  id: z.string().uuid(),
  status: deliveryStatus.optional(),
  event: z.string().max(50).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

const serializeDelivery = (
  row: typeof formWebhookDeliveriesTable.$inferSelect,
) => ({
  id: row.id,
  webhookId: row.webhookId,
  event: row.event,
  status: row.status,
  requestBody: row.requestBody as Record<string, unknown>,
  url: row.url,
  responseStatus: row.responseStatus,
  responseBody: row.responseBody,
  error: row.error,
  durationMs: row.durationMs,
  attempt: row.attempt,
  maxAttempts: row.maxAttempts,
  nextRetryAt: row.nextRetryAt ? row.nextRetryAt.toISOString() : null,
  isTest: row.isTest,
  createdAt: row.createdAt.toISOString(),
  completedAt: row.completedAt ? row.completedAt.toISOString() : null,
});

const serialize = (
  row: typeof formWebhooksTable.$inferSelect,
  deliveryCounts: Record<string, number> = {},
) => ({
  id: row.id,
  formId: row.formId,
  url: row.url,
  hasSecret: !!row.secret,
  secretPreview: safeSecretPreview(row.secret),
  secretRotatedAt: row.secretRotatedAt ? row.secretRotatedAt.toISOString() : null,
  events: row.events ?? ["response.created"],
  active: row.active,
  createdAt: row.createdAt.toISOString(),
  lastStatus: row.lastStatus ?? null,
  lastError: row.lastError ?? null,
  lastTriggeredAt: row.lastTriggeredAt
    ? row.lastTriggeredAt.toISOString()
    : null,
  consecutiveFailures: row.consecutiveFailures,
  autoDisabledAt: row.autoDisabledAt ? row.autoDisabledAt.toISOString() : null,
  autoDisabledReason: row.autoDisabledReason,
  deliveryCounts,
});

async function loadOwnedHook(webhookId: string, userId: string) {
  const rows = await db
    .select()
    .from(formWebhooksTable)
    .where(eq(formWebhooksTable.id, webhookId))
    .limit(1)
    .execute();
  const hook = rows[0];
  if (!hook) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
  }
  await assertFormOwner(hook.formId, userId);
  return hook;
}

/**
 * Rejects webhook targets that point at the server's own network before the
 * URL is persisted, so a stored hook can never be used to probe internal
 * services.
 */
async function assertWebhookUrlAllowed(rawUrl: string): Promise<void> {
  try {
    await assertPublicHttpUrl(rawUrl);
  } catch (error) {
    if (error instanceof SsrfBlockedError) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error.message,
      });
    }
    throw error;
  }
}

export const webhookRouter = router({
  /** The event catalogue, so the UI never hard-codes the list. */
  events: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/webhook-events", tags: TAGS } })
    .input(z.object({}).optional())
    .output(
      z.object({
        wildcard: z.string(),
        events: z.array(z.string()),
        groups: z.array(
          z.object({
            id: z.string(),
            label: z.string(),
            events: z.array(
              z.object({ value: z.string(), label: z.string() }),
            ),
          }),
        ),
      }),
    )
    .query(() => ({
      wildcard: WEBHOOK_EVENT_ALL,
      events: [...WEBHOOK_EVENTS],
      // `as const` in the shared catalogue makes these readonly tuples; the
      // output schema wants plain arrays.
      groups: WEBHOOK_EVENT_GROUPS.map((group) => ({
        id: group.id,
        label: group.label,
        events: group.events.map((event) => ({
          value: event.value,
          label: event.label,
        })),
      })),
    })),

  /** List webhooks configured for a form. */
  list: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/webhooks", tags: TAGS } })
    .input(listInput)
    .output(z.array(webhookOutput))
    .query(async ({ ctx, input }) => {
      await assertFormOwner(input.formId, ctx.user.id);
      const rows = await db
        .select()
        .from(formWebhooksTable)
        .where(eq(formWebhooksTable.formId, input.formId))
        .orderBy(formWebhooksTable.createdAt)
        .execute();
      return Promise.all(
        rows.map(async (row) =>
          serialize(row, await countDeliveries(row.id)),
        ),
      );
    }),

  /** Create a new webhook for a form you own. */
  create: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/webhooks", tags: TAGS } })
    .input(createInput)
    .output(webhookWithSecretOutput)
    .mutation(async ({ ctx, input }) => {
      await assertFormOwner(input.formId, ctx.user.id);
      const { entitlements } = await getUserEntitlements(ctx.user.id);
      if (!planAllowsFeature(entitlements, "webhooks")) {
        throw new TRPCError({
          code: "PAYMENT_REQUIRED",
          message: "Webhooks are not included in your plan.",
        });
      }
      await assertWebhookQuota(input.formId, entitlements);
      await assertWebhookUrlAllowed(input.url);

      // Generated by default: an unsigned hook is a silent authenticity gap,
      // since nothing then distinguishes our payload from a forged one.
      const secret = input.secret?.trim() || generateWebhookSecret();

      const inserted = await db
        .insert(formWebhooksTable)
        .values({
          formId: input.formId,
          url: input.url,
          secret,
          events: normalizeWebhookEvents(input.events),
          active: input.active,
        })
        .returning()
        .execute();
      return { ...serialize(inserted[0]!), secret };
    }),

  /** Update a webhook's URL, events or active state. */
  update: protectedProcedure
    .meta({ openapi: { method: "PATCH", path: "/webhooks/{id}", tags: TAGS } })
    .input(updateInput)
    .output(webhookOutput)
    .mutation(async ({ ctx, input }) => {
      const hook = await loadOwnedHook(input.id, ctx.user.id);

      if (input.url !== undefined) {
        await assertWebhookUrlAllowed(input.url);
      }

      // Turning a hook back on clears the failure state, otherwise the UI
      // would keep showing the auto-disable banner for a hook the owner just
      // re-armed.
      const reEnabling = input.active === true && !hook.active;

      const updated = await db
        .update(formWebhooksTable)
        .set({
          url: input.url ?? hook.url,
          events: input.events
            ? normalizeWebhookEvents(input.events)
            : hook.events,
          active: input.active ?? hook.active,
          ...(reEnabling
            ? {
                consecutiveFailures: 0,
                autoDisabledAt: null,
                autoDisabledReason: null,
              }
            : {}),
        })
        .where(eq(formWebhooksTable.id, input.id))
        .returning()
        .execute();

      return serialize(updated[0]!, await countDeliveries(input.id));
    }),

  /** Replace the signing secret. Returns the new value exactly once. */
  rotateSecret: protectedProcedure
    .meta({
      openapi: { method: "POST", path: "/webhooks/{id}/rotate-secret", tags: TAGS },
    })
    .input(idInput)
    .output(webhookWithSecretOutput)
    .mutation(async ({ ctx, input }) => {
      await loadOwnedHook(input.id, ctx.user.id);
      const secret = generateWebhookSecret();
      const updated = await db
        .update(formWebhooksTable)
        .set({ secret, secretRotatedAt: new Date(), consecutiveFailures: 0 })
        .where(eq(formWebhooksTable.id, input.id))
        .returning()
        .execute();
      return { ...serialize(updated[0]!), secret };
    }),

  /**
   * Read the current secret back.
   *
   * Only the form owner, and only because a receiver that has lost its copy
   * otherwise has no way to recover it. Callers should log the value out.
   */
  revealSecret: protectedProcedure
    .meta({
      openapi: { method: "GET", path: "/webhooks/{id}/secret", tags: TAGS },
    })
    .input(idInput)
    .output(z.object({ secret: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const hook = await loadOwnedHook(input.id, ctx.user.id);
      return { secret: hook.secret };
    }),

  /** Delete a webhook (cascades its delivery history). */
  delete: protectedProcedure
    .meta({ openapi: { method: "DELETE", path: "/webhooks/{id}", tags: TAGS } })
    .input(idInput)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await loadOwnedHook(input.id, ctx.user.id);
      await db
        .delete(formWebhooksTable)
        .where(eq(formWebhooksTable.id, input.id))
        .execute();
      return { success: true };
    }),

  /** Recent deliveries for one webhook, newest first. */
  deliveries: protectedProcedure
    .meta({
      openapi: { method: "GET", path: "/webhooks/{id}/deliveries", tags: TAGS },
    })
    .input(deliveriesInput)
    .output(
      z.object({
        deliveries: z.array(deliveryOutput),
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
        counts: z.record(z.string(), z.number()),
      }),
    )
    .query(async ({ ctx, input }) => {
      await loadOwnedHook(input.id, ctx.user.id);
      const { page, pageSize } = input;

      const conditions = [eq(formWebhookDeliveriesTable.webhookId, input.id)];
      if (input.status) {
        conditions.push(eq(formWebhookDeliveriesTable.status, input.status));
      }
      if (input.event) {
        conditions.push(eq(formWebhookDeliveriesTable.event, input.event));
      }
      const where = and(...conditions);

      // Newest first, paginated in SQL.
      const rows = await db
        .select()
        .from(formWebhookDeliveriesTable)
        .where(where)
        .orderBy(desc(formWebhookDeliveriesTable.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute();

      const [totalRow] = await db
        .select({ total: count() })
        .from(formWebhookDeliveriesTable)
        .where(where)
        .execute();

      return {
        deliveries: rows.map(serializeDelivery),
        total: Number(totalRow?.total ?? 0),
        page,
        pageSize,
        counts: await countDeliveries(input.id),
      };
    }),

  /**
   * Send a real sample payload to the endpoint.
   *
   * Goes through the same enqueue → sign → record path as a live event, so the
   * result lands in the delivery log and is inspectable. `maxAttempts: 1`
   * because a probe to a broken endpoint should not sit in the retry queue for
   * hours; the owner can redeliver from the log if they want another go.
   */
  test: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/webhooks/{id}/test", tags: TAGS } })
    .input(
      z.object({
        id: z.string().uuid(),
        event: z.string().max(50).default("response.created"),
      }),
    )
    .output(
      z.object({
        ok: z.boolean(),
        status: z.number().int(),
        error: z.string().nullable().optional(),
        durationMs: z.number().int().nullable().optional(),
        deliveryId: z.string().uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const hook = await loadOwnedHook(input.id, ctx.user.id);
      await assertWebhookUrlAllowed(hook.url);

      const [form] = await db
        .select()
        .from(formsTable)
        .where(eq(formsTable.id, hook.formId))
        .limit(1)
        .execute();

      const payload = samplePayload(input.event, form ?? null);

      const inserted = await db
        .insert(formWebhookDeliveriesTable)
        .values({
          webhookId: hook.id,
          event: input.event,
          status: "pending",
          requestBody: payload,
          url: hook.url,
          attempt: 1,
          maxAttempts: 1,
          isTest: true,
          // NULL = due immediately.
          nextRetryAt: null,
        })
        .returning()
        .execute();

      await deliverDeliveries([inserted[0]!.id]);
      const settled = await db
        .select()
        .from(formWebhookDeliveriesTable)
        .where(eq(formWebhookDeliveriesTable.id, inserted[0]!.id))
        .limit(1)
        .execute();

      // Read the outcome back from the row rather than from the in-memory
      // result: the worker may have won the claim, in which case the row is
      // still the only source of truth.
      const outcome = settled[0];
      return {
        ok: outcome?.status === "success",
        status: outcome?.responseStatus ?? 0,
        error: outcome?.error ?? null,
        durationMs: outcome?.durationMs ?? null,
        deliveryId: inserted[0]!.id,
      };
    }),

  /** Sample payload for an event, without sending anything. */
  preview: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/webhooks/preview", tags: TAGS } })
    .input(
      z.object({
        formId: z.string().uuid(),
        event: z.string().max(50).default("response.created"),
      }),
    )
    .output(
      z.object({
        event: z.string(),
        payload: z.record(z.string(), z.unknown()),
        headers: z.record(z.string(), z.string()),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertFormOwner(input.formId, ctx.user.id);
      const [form] = await db
        .select()
        .from(formsTable)
        .where(eq(formsTable.id, input.formId))
        .limit(1)
        .execute();

      const payload = samplePayload(input.event, form ?? null);
      const body = JSON.stringify(payload, null, 2);
      return {
        event: input.event,
        payload,
        headers: {
          "Content-Type": "application/json",
          "x-formly-event": input.event,
          "x-formly-delivery": "<delivery uuid>",
          "x-formly-attempt": "1",
          "x-formly-signature": "t=<unix seconds>,v1=<hex hmac-sha256>",
        },
      };
    }),

  /** Re-send a settled delivery verbatim, recorded as a new attempt. */
  redeliver: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/webhooks/{webhookId}/deliveries/{deliveryId}/redeliver",
        tags: TAGS,
      },
    })
    .input(
      z.object({
        deliveryId: z.string().uuid(),
        webhookId: z.string().uuid(),
      }),
    )
    .output(z.object({ deliveryId: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await loadOwnedHook(input.webhookId, ctx.user.id);
      const rows = await db
        .select()
        .from(formWebhookDeliveriesTable)
        .where(eq(formWebhookDeliveriesTable.id, input.deliveryId))
        .limit(1)
        .execute();
      const delivery = rows[0];
      if (!delivery || delivery.webhookId !== input.webhookId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Delivery not found" });
      }
      // A delivery still waiting on its own backoff is already scheduled;
      // queueing another copy would double-send.
      if (delivery.status === "pending" || delivery.status === "retrying") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This delivery is still being retried.",
        });
      }
      const id = await redeliver(delivery);
      return { deliveryId: id };
    }),

  /** Recompute the signature header for a stored body, for debugging receivers. */
  resign: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/webhooks/{webhookId}/deliveries/{deliveryId}/resign",
        tags: TAGS,
      },
    })
    .input(
      z.object({
        deliveryId: z.string().uuid(),
        webhookId: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        signature: z.string().nullable(),
        timestamp: z.string(),
        retryable: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const hook = await loadOwnedHook(input.webhookId, ctx.user.id);
      const rows = await db
        .select()
        .from(formWebhookDeliveriesTable)
        .where(eq(formWebhookDeliveriesTable.id, input.deliveryId))
        .limit(1)
        .execute();
      const delivery = rows[0];
      if (!delivery || delivery.webhookId !== input.webhookId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Delivery not found" });
      }
      const body = JSON.stringify(delivery.requestBody);
      const { signature, timestamp } = signatureForStoredBody(body, hook.secret);
      return {
        signature,
        timestamp,
        retryable:
          delivery.responseStatus === null
            ? true
            : isRetryableStatus(delivery.responseStatus),
      };
    }),
});
