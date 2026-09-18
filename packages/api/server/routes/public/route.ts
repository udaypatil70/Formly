import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { db, eq, and, desc, count, ilike } from "@repo/db";
import {
  answersTable,
  formsTable,
  responsesTable,
  themesTable,
  formViewsTable,
} from "@repo/db/schema";
import { TRPCError } from "@trpc/server";
import { buildResponseSchema, AnswerValueSchema } from "@repo/validators";
import { router, publicProcedure } from "../../trpc";
import {
  getFieldsForForm,
  toValidatorField,
  getTheme,
  getFormBy,
} from "../../utils/form";
import { serializeForm, serializeTheme } from "../../utils/serialize";
import { fieldOutput, themeOutput } from "../../utils/schemas";
import { rateLimit } from "../../utils/rate-limit";
import { verifyTurnstileToken } from "../../utils/turnstile";
import { parseUserAgent } from "../../utils/ua";
import { verifyPassword } from "../../utils/password";
import { notifyNewResponse } from "../../utils/notifications";
import { triggerWebhooks } from "../../utils/webhooks";
import type { SelectForm } from "@repo/db/schema";

const TAGS = ["Public"];

const hashIp = (ip: string) =>
  createHash("sha256").update(`formforge-salt:${ip}`).digest("hex");

const publicFormViewOutput = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable().optional(),
  slug: z.string(),
  visibility: z.enum(["public", "unlisted"]),
  settings: z
    .object({
      expiry: z.string().nullable().optional(),
      responseLimit: z.number().int().positive().optional(),
      thankYouMessage: z.string().nullable().optional(),
      stepMode: z.enum(["all", "page", "question"]).optional(),
      startScreen: z
        .object({
          enabled: z.boolean(),
          title: z.string().optional(),
          description: z.string().optional(),
          buttonLabel: z.string().optional(),
        })
        .optional(),
      endScreen: z
        .object({
          enabled: z.boolean(),
          title: z.string().optional(),
          message: z.string().optional(),
          buttonLabel: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  requiresPassword: z.boolean(),
  locked: z.boolean(),
  incorrectPassword: z.boolean(),
  blocked: z.enum(["expired", "limit_reached"]).nullish(),
  fields: z.array(fieldOutput),
  theme: themeOutput.nullable(),
});

const getBySlugInput = z.object({
  slug: z.string().min(1).max(255),
  password: z.string().optional(),
});

const submitInput = z.object({
  slug: z.string().min(1).max(255),
  password: z.string().optional(),
  completedInSeconds: z.number().int().positive().optional(),
  answers: z.record(z.string(), z.unknown()),
  honeypot: z.string().optional(),
  turnstileToken: z.string().optional(),
});

/** Load a published, non-archived form by slug. */
async function loadPublishedForm(slug: string): Promise<SelectForm> {
  return getFormBy(
    and(
      eq(formsTable.slug, slug),
      eq(formsTable.status, "published"),
      eq(formsTable.archived, false),
    )!,
  );
}

/** Returns "expired" / "limit_reached" when the form should stop accepting views. */
async function blockedState(
  form: SelectForm,
): Promise<"expired" | "limit_reached" | null> {
  const settings = form.settings ?? {};

  if (settings.expiry) {
    const expiry = new Date(settings.expiry);
    if (isNaN(expiry.getTime()) || expiry.getTime() < Date.now()) {
      return "expired";
    }
  }

  if (settings.responseLimit) {
    const [countRow] = await db
      .select({ count: count() })
      .from(responsesTable)
      .where(eq(responsesTable.formId, form.id))
      .execute();
    if (Number(countRow?.count ?? 0) >= settings.responseLimit) {
      return "limit_reached";
    }
  }

  return null;
}

/** Checks the (optional) form password against a plaintext attempt. */
function passwordState(form: SelectForm, password?: string) {
  const stored = form.settings?.password;
  if (!stored) return { locked: false };
  if (password == null || password === "") return { locked: true };
  if (!verifyPassword(password, stored)) return { locked: true, incorrect: true };
  return { locked: false };
}

export const publicRouter = router({
  /** Fetch a published form by slug for the public renderer. */
  getFormBySlug: publicProcedure
    .meta({
      openapi: { method: "GET", path: "/public/forms/{slug}", tags: TAGS },
    })
    .input(getBySlugInput)
    .output(publicFormViewOutput)
    .query(async ({ ctx, input }) => {
      const ipKey = ctx.ip ?? "unknown";
      const limited = await rateLimit(`view:${hashIp(ipKey)}`, {
        limit: 30,
        windowMs: 60_000,
      });
      if (limited.limited) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests, please try again later",
        });
      }

      const form = await loadPublishedForm(input.slug);
      const settings = form.settings ?? {};
      const { password: _password, notificationEmail: _notificationEmail, ...safeSettings } = settings;
      const theme = await getTheme(form.themeId);

      const blocked = await blockedState(form);
      if (blocked) {
        return {
          id: form.id,
          title: form.title,
          description: form.description,
          slug: form.slug,
          visibility: form.visibility,
          settings: safeSettings,
          requiresPassword: false,
          locked: false,
          incorrectPassword: false,
          blocked,
          fields: [],
          theme: null,
        };
      }

      const auth = passwordState(form, input.password);
      if (auth.locked) {
        return {
          id: form.id,
          title: form.title,
          description: form.description,
          slug: form.slug,
          visibility: form.visibility,
          settings: safeSettings,
          requiresPassword: true,
          locked: true,
          incorrectPassword: !!auth.incorrect,
          blocked: null,
          fields: [],
          theme: serializeTheme(theme),
        };
      }

      const fields = await getFieldsForForm(form.id);

      const { device, browser } = parseUserAgent(ctx.headers.get("user-agent"));
      await db
        .insert(formViewsTable)
        .values({ formId: form.id, device, browser })
        .execute();

      return {
        id: form.id,
        title: form.title,
        description: form.description,
        slug: form.slug,
        visibility: form.visibility,
        settings: safeSettings,
        requiresPassword: false,
        locked: false,
        incorrectPassword: false,
        blocked: null,
        fields: fields.fields.map((field) =>
          toValidatorField(field, fields.optionsByField.get(field.id)),
        ),
        theme: serializeTheme(theme),
      };
    }),

  /** Submit a response to a published form (rate-limited, schema-validated). */
  submitResponse: publicProcedure
    .meta({
      openapi: { method: "POST", path: "/public/forms/{slug}/responses", tags: TAGS },
    })
    .input(submitInput)
    .output(
      z.object({
        success: z.boolean(),
        responseId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const form = await loadPublishedForm(input.slug);
      const settings = form.settings ?? {};
      const { password } = input;

      if (settings.expiry) {
        const expiry = new Date(settings.expiry);
        if (isNaN(expiry.getTime()) || expiry.getTime() < Date.now()) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This form has expired",
          });
        }
      }

      if (settings.password) {
        if (password == null || password === "") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This form is password protected",
          });
        }
        if (!verifyPassword(password, settings.password)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Incorrect password",
          });
        }
      }

      // Honeypot: silently accept spam so bots think the submit succeeded.
      if (typeof input.honeypot === "string" && input.honeypot.length > 0) {
        return { success: true, responseId: randomUUID() };
      }

      // Turnstile: reject when configured but the token is missing/invalid.
      const turnstileOk = await verifyTurnstileToken(
        input.turnstileToken,
        ctx.ip ?? undefined,
      );
      if (!turnstileOk) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bot verification failed. Please retry.",
        });
      }

      if (settings.responseLimit) {
        const [countRow] = await db
          .select({ count: count() })
          .from(responsesTable)
          .where(eq(responsesTable.formId, form.id))
          .execute();
        if (Number(countRow?.count ?? 0) >= settings.responseLimit) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This form has reached its response limit",
          });
        }
      }

      const ipKey = ctx.ip ?? "unknown";
      const limited = await rateLimit(`submit:${hashIp(ipKey)}`, {
        limit: 5,
        windowMs: 60_000,
      });
      if (limited.limited) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many submissions, please try again later",
        });
      }

      const { fields, optionsByField } = await getFieldsForForm(form.id);
      const validatorFields = fields.map((field) =>
        toValidatorField(field, optionsByField.get(field.id)),
      );
      const responseSchema = buildResponseSchema(validatorFields);

      const result = responseSchema.safeParse(input.answers);
      if (!result.success) {
        const issues = result.error.issues.map(
          (issue) => `${issue.path.join(".")}: ${issue.message}`,
        );
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid submission: ${issues.join("; ")}`,
        });
      }

      const responseId = await db.transaction(async (tx) => {
        const { device, browser } = parseUserAgent(ctx.headers.get("user-agent"));
        const inserted = await tx
          .insert(responsesTable)
          .values({
            formId: form.id,
            ipHash: hashIp(ipKey),
            completedInSeconds: input.completedInSeconds ?? null,
            device,
            browser,
          })
          .returning()
          .execute();

        const response = inserted[0]!;

        if (Object.keys(result.data).length > 0) {
          await tx
            .insert(answersTable)
            .values(
              Object.entries(result.data).map(([fieldId, value]) => ({
                responseId: response.id,
                fieldId,
                value: value as z.infer<typeof AnswerValueSchema> | null,
              })),
            )
            .execute();
        }

        return { id: response.id, submittedAt: response.submittedAt };
      });

      void notifyNewResponse({
        form,
        fields: validatorFields,
        answers: result.data,
        responseId: responseId.id,
        submittedAt: responseId.submittedAt.toISOString(),
      });

      void triggerWebhooks({
        form,
        fields: validatorFields,
        answers: result.data,
        responseId: responseId.id,
        submittedAt: responseId.submittedAt.toISOString(),
      });

      return { success: true, responseId: responseId.id };
    }),

  /** Explore/gallery: list published public forms (paginated, searchable). */
  getExploreForms: publicProcedure
    .meta({
      openapi: { method: "GET", path: "/explore/forms", tags: TAGS },
    })
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().min(1).max(50).default(12),
        search: z.string().max(100).optional(),
        featured: z.boolean().optional(),
        category: z
          .enum([
            "movies",
            "anime",
            "games",
            "startups",
            "tech",
            "os",
            "events",
            "community",
          ])
          .optional(),
      }),
    )
    .output(
      z.object({
        forms: z.array(
          z.object({
            id: z.string().uuid(),
            title: z.string(),
            description: z.string().nullable().optional(),
            slug: z.string(),
            createdAt: z.string(),
            isFeatured: z.boolean(),
            responseCount: z.number(),
            themeName: z.string().nullable().optional(),
            themeCategory: z.string().nullable().optional(),
            colors: z
              .object({
                primary: z.string(),
                background: z.string(),
                surface: z.string(),
                text: z.string(),
              })
              .nullable()
              .optional(),
          }),
        ),
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
      }),
    )
    .query(async ({ input }) => {
      const { page, pageSize } = input;

      const conditions = [
        eq(formsTable.status, "published"),
        eq(formsTable.archived, false),
        eq(formsTable.visibility, "public"),
      ];
      if (input.search) {
        const search = `%${input.search}%`;
        conditions.push(ilike(formsTable.title, search));
      }
      if (input.featured) {
        conditions.push(eq(formsTable.isFeatured, true));
      }
      if (input.category) {
        conditions.push(eq(themesTable.category, input.category));
      }

      const rows = await db
        .select({
          form: formsTable,
          themeName: themesTable.name,
          themeCategory: themesTable.category,
          themeColors: themesTable.colors,
          responseCount: count(responsesTable.id),
        })
        .from(formsTable)
        .leftJoin(themesTable, eq(themesTable.id, formsTable.themeId))
        .leftJoin(responsesTable, eq(responsesTable.formId, formsTable.id))
        .where(and(...conditions))
        .groupBy(formsTable.id, themesTable.id)
        .orderBy(desc(formsTable.isFeatured), desc(formsTable.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute();

      const [totalRow] = await db
        .select({ total: count() })
        .from(formsTable)
        .where(and(...conditions))
        .execute();

      return {
        forms: rows.map((row) => ({
          id: row.form.id,
          title: row.form.title,
          description: row.form.description,
          slug: row.form.slug,
          createdAt: row.form.createdAt.toISOString(),
          isFeatured: row.form.isFeatured,
          responseCount: Number(row.responseCount),
          themeName: row.themeName ?? null,
          themeCategory: row.themeCategory ?? null,
          colors: row.themeColors ?? {
            primary: "#6d28d9",
            background: "#09090b",
            surface: "#18181b",
            text: "#fafafa",
          },
        })),
        total: Number(totalRow?.total ?? 0),
        page,
        pageSize,
      };
    }),
});