import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { db, eq, and, desc, count, ilike } from "@repo/db";
import {
  answersTable,
  formsTable,
  responsesTable,
  themesTable,
  formViewsTable,
  formPaymentsTable,
  formDraftsTable,
} from "@repo/db/schema";
import { TRPCError } from "@trpc/server";
import {
  buildResponseSchema,
  AnswerValueSchema,
  PaymentAnswerValueSchema,
} from "@repo/validators";
import { router, publicProcedure } from "../../trpc";
import {
  getFieldsForForm,
  toValidatorField,
  getTheme,
  getFormBy,
  normalizeDomain,
} from "../../utils/form";
import { serializeForm, serializeTheme } from "../../utils/serialize";
import { fieldOutput, themeOutput } from "../../utils/schemas";
import { rateLimit } from "../../utils/rate-limit";
import { verifyTurnstileToken } from "../../utils/turnstile";
import { parseUserAgent } from "../../utils/ua";
import { verifyPassword } from "../../utils/password";
import { notifyNewResponse } from "../../utils/notifications";
import { triggerWebhooks } from "../../utils/webhooks";
import {
  razorpayConfigured,
  verifyRazorpaySignature,
} from "../../utils/razorpay";
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
  customDomain: z.string().nullable().optional(),
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

const saveDraftInput = z.object({
  slug: z.string().min(1).max(255),
  password: z.string().optional(),
  /** Existing resume token to keep the same draft (undefined = new draft). */
  token: z.string().min(16).max(128).optional(),
  answers: z.record(z.string(), z.unknown()),
  currentStep: z.number().int().nonnegative().optional(),
});

const getDraftInput = z.object({
  slug: z.string().min(1).max(255),
  token: z.string().min(16).max(128),
});

const resolveDomainInput = z.object({
  domain: z.string().min(1).max(255),
  password: z.string().optional(),
});

const submitInput = z.object({
  slug: z.string().min(1).max(255),
  password: z.string().optional(),
  completedInSeconds: z.number().int().positive().optional(),
  answers: z.record(z.string(), z.unknown()),
  honeypot: z.string().optional(),
  turnstileToken: z.string().optional(),
  payments: z
    .array(
      z.object({
        fieldId: z.string().uuid(),
        orderId: z.string().min(1),
        paymentId: z.string().min(1),
        signature: z.string().min(1),
      }),
    )
    .max(10)
    .optional(),
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

type PublicFormView = z.infer<typeof publicFormViewOutput>;

/**
 * Builds the shared public renderer payload for a published form.
 * Handles blocked / password-locked states the same way for slug, domain and
 * draft-based lookups so every entry point returns a consistent shape.
 */
async function buildPublicFormView(
  form: SelectForm,
  password?: string,
): Promise<PublicFormView> {
  const settings = form.settings ?? {};
  const safeSettings = {
    ...settings,
    password: undefined,
    notificationEmail: undefined,
  };
  const theme = await getTheme(form.themeId);

  const base = {
    id: form.id,
    title: form.title,
    description: form.description,
    slug: form.slug,
    visibility: form.visibility,
    customDomain: form.customDomain,
    settings: safeSettings,
  };

  const blocked = await blockedState(form);
  if (blocked) {
    return {
      ...base,
      requiresPassword: false,
      locked: false,
      incorrectPassword: false,
      blocked,
      fields: [],
      theme: null,
    };
  }

  const auth = passwordState(form, password);
  if (auth.locked) {
    return {
      ...base,
      requiresPassword: true,
      locked: true,
      incorrectPassword: !!auth.incorrect,
      blocked: null,
      fields: [],
      theme: serializeTheme(theme),
    };
  }

  const fields = await getFieldsForForm(form.id);
  return {
    ...base,
    requiresPassword: false,
    locked: false,
    incorrectPassword: false,
    blocked: null,
    fields: fields.fields.map((field) =>
      toValidatorField(field, fields.optionsByField.get(field.id)),
    ),
    theme: serializeTheme(theme),
  };
}

const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
      const view = await buildPublicFormView(form, input.password);

      if (view.locked || view.blocked) {
        return view;
      }

      const { device, browser } = parseUserAgent(ctx.headers.get("user-agent"));
      await db
        .insert(formViewsTable)
        .values({ formId: form.id, device, browser })
        .execute();

      return view;
    }),

  /**
   * Resolve a form by its custom domain (served on the frontend vhost).
   * Returns the exact same payload as getFormBySlug so the public renderer is
   * agnostic to how the form was reached.
   */
  resolveDomain: publicProcedure
    .input(resolveDomainInput)
    .output(publicFormViewOutput)
    .query(async ({ input }) => {
      const domain = normalizeDomain(input.domain);
      const form = await getFormBy(
        and(
          eq(formsTable.customDomain, domain),
          eq(formsTable.status, "published"),
          eq(formsTable.archived, false),
        )!,
      );
      return buildPublicFormView(form, input.password);
    }),

  /** Save a visitor's in-progress answers so they can resume later. */
  saveDraft: publicProcedure
    .input(saveDraftInput)
    .output(
      z.object({
        token: z.string(),
        resumeUrl: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ipKey = ctx.ip ?? "unknown";
      const limited = await rateLimit(`draft:${hashIp(ipKey)}`, {
        limit: 20,
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
        if (input.password == null || input.password === "") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This form is password protected",
          });
        }
        if (!verifyPassword(input.password, settings.password)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Incorrect password",
          });
        }
      }

      const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);

      const existing = input.token
        ? await db
            .select({ id: formDraftsTable.id })
            .from(formDraftsTable)
            .where(
              and(
                eq(formDraftsTable.formId, form.id),
                eq(formDraftsTable.resumeToken, input.token),
              ),
            )
            .limit(1)
            .execute()
        : [];

      let token: string;

      if (existing.length > 0) {
        token = input.token!;
        await db
          .update(formDraftsTable)
          .set({
            answers: input.answers,
            currentStep: input.currentStep ?? 0,
            expiresAt,
          })
          .where(eq(formDraftsTable.id, existing[0]!.id))
          .execute();
      } else {
        token = randomBytes(32).toString("hex");
        await db
          .insert(formDraftsTable)
          .values({
            formId: form.id,
            resumeToken: token,
            answers: input.answers,
            currentStep: input.currentStep ?? 0,
            expiresAt,
          })
          .execute();
      }

      return { token, resumeUrl: `/form/${form.slug}?draft=${token}` };
    }),

  /** Load a previously saved draft by its secret resume token. */
  getDraft: publicProcedure
    .input(getDraftInput)
    .output(
      z.object({
        answers: z.record(z.string(), z.unknown()),
        currentStep: z.number(),
        expiresAt: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const form = await loadPublishedForm(input.slug);
      const rows = await db
        .select()
        .from(formDraftsTable)
        .where(
          and(
            eq(formDraftsTable.formId, form.id),
            eq(formDraftsTable.resumeToken, input.token),
          ),
        )
        .limit(1)
        .execute();

      const draft = rows[0];
      if (!draft) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
      }
      if (draft.expiresAt.getTime() < Date.now()) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This draft has expired",
        });
      }
      return {
        answers: draft.answers ?? {},
        currentStep: draft.currentStep ?? 0,
        expiresAt: draft.expiresAt.toISOString(),
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

      // Payment fields: every one must have a verified, unused Razorpay
      // payment. The payment answer is rebuilt server-side from the order we
      // created, never trusted from the client payload.
      const paymentFields = validatorFields.filter(
        (f) => f.type === "payment",
      );
      const pendingPayments: {
        row: { id: string };
        answer: z.infer<typeof PaymentAnswerValueSchema>;
      }[] = [];

      if (paymentFields.length > 0) {
        if (!razorpayConfigured()) {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: "Payments are not configured yet",
          });
        }
        const payments = input.payments ?? [];
        for (const field of paymentFields) {
          const entry = payments.find((p) => p.fieldId === field.id);
          if (!entry) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Payment required for "${field.label}"`,
            });
          }

          const signatureValid = verifyRazorpaySignature({
            orderId: entry.orderId,
            paymentId: entry.paymentId,
            signature: entry.signature,
          });
          if (!signatureValid) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Payment verification failed. Please try again.",
            });
          }

          const rows = await db
            .select({
              id: formPaymentsTable.id,
              status: formPaymentsTable.status,
              amountPaise: formPaymentsTable.amountPaise,
              currency: formPaymentsTable.currency,
            })
            .from(formPaymentsTable)
            .where(
              and(
                eq(formPaymentsTable.razorpayOrderId, entry.orderId),
                eq(formPaymentsTable.formId, form.id),
                eq(formPaymentsTable.fieldId, field.id),
              ),
            )
            .limit(1)
            .execute();

          const paymentRow = rows[0];
          if (!paymentRow) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Payment order not found for this form",
            });
          }
          if (paymentRow.status !== "created") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This payment has already been used",
            });
          }

          const expectedPaise = Math.round(
            (field.validationRules?.amount ?? 0) * 100,
          );
          if (expectedPaise <= 0 || paymentRow.amountPaise !== expectedPaise) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Payment amount does not match",
            });
          }

          const answer = PaymentAnswerValueSchema.parse({
            paymentId: entry.paymentId,
            orderId: entry.orderId,
            amount: expectedPaise / 100,
            currency: paymentRow.currency,
            status: "paid",
          });
          result.data[field.id] = answer;
          pendingPayments.push({ row: { id: paymentRow.id }, answer });
        }
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

        for (const payment of pendingPayments) {
          await tx
            .update(formPaymentsTable)
            .set({
              status: "paid",
              razorpayPaymentId: payment.answer.paymentId,
              responseId: response.id,
              paidAt: new Date(),
            })
            .where(eq(formPaymentsTable.id, payment.row.id))
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