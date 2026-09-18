import { createHmac } from "node:crypto";
import { z } from "zod";
import { db, eq } from "@repo/db";
import { formWebhooksTable } from "@repo/db/schema";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../trpc";
import { assertFormOwner } from "../form/route";

const TAGS = ["Webhooks"];

export const webhookOutput = z.object({
  id: z.string().uuid(),
  formId: z.string().uuid(),
  url: z.string(),
  secret: z.string().nullable().optional(),
  events: z.array(z.string()),
  active: z.boolean(),
  createdAt: z.string(),
  lastStatus: z.number().int().nullable().optional(),
  lastError: z.string().nullable().optional(),
  lastTriggeredAt: z.string().nullable().optional(),
});

const listInput = z.object({ formId: z.string().uuid() });

const createInput = z.object({
  formId: z.string().uuid(),
  url: z.string().url("Enter a valid HTTPS URL"),
  secret: z.string().max(255).optional(),
  events: z.array(z.string().max(50)).max(10).default(["response.created"]),
  active: z.boolean().default(true),
});

const updateInput = z.object({
  id: z.string().uuid(),
  url: z.string().url("Enter a valid HTTPS URL").optional(),
  secret: z.string().max(255).nullable().optional(),
  events: z.array(z.string().max(50)).max(10).optional(),
  active: z.boolean().optional(),
});

const deleteInput = z.object({ id: z.string().uuid() });

const serialize = (row: typeof formWebhooksTable.$inferSelect) => ({
  id: row.id,
  formId: row.formId,
  url: row.url,
  secret: row.secret ?? null,
  events: row.events ?? ["response.created"],
  active: row.active,
  createdAt: row.createdAt.toISOString(),
  lastStatus: row.lastStatus ?? null,
  lastError: row.lastError ?? null,
  lastTriggeredAt: row.lastTriggeredAt
    ? row.lastTriggeredAt.toISOString()
    : null,
});

export const webhookRouter = router({
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
      return rows.map(serialize);
    }),

  /** Create a new webhook for a form you own. */
  create: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/webhooks", tags: TAGS } })
    .input(createInput)
    .output(webhookOutput)
    .mutation(async ({ ctx, input }) => {
      await assertFormOwner(input.formId, ctx.user.id);
      const inserted = await db
        .insert(formWebhooksTable)
        .values({
          formId: input.formId,
          url: input.url,
          secret: input.secret?.trim() || null,
          events: input.events,
          active: input.active,
        })
        .returning()
        .execute();
      return serialize(inserted[0]!);
    }),

  /** Update a webhook's URL, events or active state. */
  update: protectedProcedure
    .meta({ openapi: { method: "PATCH", path: "/webhooks/{id}", tags: TAGS } })
    .input(updateInput)
    .output(webhookOutput)
    .mutation(async ({ ctx, input }) => {
      const rows = await db
        .select()
        .from(formWebhooksTable)
        .where(eq(formWebhooksTable.id, input.id))
        .limit(1)
        .execute();
      const hook = rows[0];
      if (!hook) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      }
      await assertFormOwner(hook.formId, ctx.user.id);

      const updated = await db
        .update(formWebhooksTable)
        .set({
          url: input.url ?? hook.url,
          secret: input.secret !== undefined ? (input.secret?.trim() || null) : hook.secret,
          events: input.events ?? hook.events,
          active: input.active ?? hook.active,
        })
        .where(eq(formWebhooksTable.id, input.id))
        .returning()
        .execute();
      return serialize(updated[0]!);
    }),

  /** Delete a webhook. */
  delete: protectedProcedure
    .meta({ openapi: { method: "DELETE", path: "/webhooks/{id}", tags: TAGS } })
    .input(deleteInput)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await db
        .select()
        .from(formWebhooksTable)
        .where(eq(formWebhooksTable.id, input.id))
        .limit(1)
        .execute();
      const hook = rows[0];
      if (!hook) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      }
      await assertFormOwner(hook.formId, ctx.user.id);
      await db
        .delete(formWebhooksTable)
        .where(eq(formWebhooksTable.id, input.id))
        .execute();
      return { success: true };
    }),

  /** Send a sample payload to verify the endpoint is wired up. */
  test: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/webhooks/{id}/test", tags: TAGS } })
    .input(deleteInput)
    .output(
      z.object({
        ok: z.boolean(),
        status: z.number().int(),
        error: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rows = await db
        .select()
        .from(formWebhooksTable)
        .where(eq(formWebhooksTable.id, input.id))
        .limit(1)
        .execute();
      const hook = rows[0];
      if (!hook) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      }
      await assertFormOwner(hook.formId, ctx.user.id);

      const sample = {
        event: "response.created",
        form: { id: hook.formId, title: "Test form", slug: "test-form" },
        response: {
          id: "00000000-0000-4000-8000-000000000000",
          submittedAt: new Date().toISOString(),
          answers: [{ fieldId: "x", label: "Sample", value: "Hello" }],
        },
      };

      const payload = JSON.stringify(sample);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "Formforge-Webhooks/1.0",
      };
      if (hook.secret) {
        const signature = createHmac("sha256", hook.secret)
          .update(payload)
          .digest("hex");
        headers["x-formforge-signature"] = `sha256=${signature}`;
      }

      try {
        const response = await fetch(hook.url, {
          method: "POST",
          headers,
          body: payload,
          signal: AbortSignal.timeout(10_000),
        });
        return {
          ok: response.ok,
          status: response.status,
          error: response.ok ? null : `HTTP ${response.status} ${response.statusText}`,
        };
      } catch (error) {
        return {
          ok: false,
          status: 0,
          error: error instanceof Error ? error.message : "Delivery failed",
        };
      }
    }),
});