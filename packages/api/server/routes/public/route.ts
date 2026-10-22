import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { db, eq, and, or, desc, count, ilike, isNull, inArray, sql } from "@repo/db";
import {
  answersTable,
  formsTable,
  responsesTable,
  themesTable,
  formViewsTable,
  formPaymentsTable,
  formDraftsTable,
  formFileUploadsTable,
} from "@repo/db/schema";
import { TRPCError } from "@trpc/server";
import {
  buildResponseSchema,
  AnswerValueSchema,
  FileAnswerValueSchema,
  PaymentAnswerValueSchema,
  isFieldVisible,
  toMinorUnits,
  fromMinorUnits,
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
import {
  emitPaymentEvent,
  emitDraftSaved,
  emitResponseCreated,
  emitResponseUpdated,
} from "../../utils/webhooks";
import { consumeResponseQuota, getUserEntitlements } from "../../utils/plans";
import { signUploadPath } from "@repo/services/upload-signature";
import {
  razorpayConfigured,
  verifyRazorpaySignature,
} from "../../utils/razorpay";
import type { SelectForm } from "@repo/db/schema";

const TAGS = ["Public"];

const hashIp = (ip: string) =>
  createHash("sha256").update(`formly-salt:${ip}`).digest("hex");

const hashVisitor = (visitorId: string | null) =>
  visitorId
    ? createHash("sha256").update(`formly-visitor:${visitorId}`).digest("hex")
    : null;

/** Browser user agents that are never a real respondent. */
const BOT_USER_AGENT =
  /(bot\b|crawler|spider|headless|phantomjs|selenium|puppeteer|playwright|python-requests|python-urllib|curl\/|wget\/|go-http-client|java\/|libwww|scrapy)/i;

/** A submission completed faster than this was not filled in by a person. */
const MIN_COMPLETION_SECONDS = 3;

/** How long a respondent can reopen and edit their submission. */
const EDIT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const publicFormViewOutput = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable().optional(),
  slug: z.string(),
  visibility: z.enum(["public", "unlisted"]),
  /** False for unlisted forms; the client renders them with noindex metadata. */
  listed: z.boolean(),
  customDomain: z.string().nullable().optional(),
  settings: z
    .object({
      expiry: z.string().nullable().optional(),
      opensAt: z.string().nullable().optional(),
      closesAt: z.string().nullable().optional(),
      responseTarget: z.number().int().positive().nullable().optional(),
      responseLimit: z.number().int().positive().nullable().optional(),
      closeMessage: z.string().nullable().optional(),
      allowMultipleResponses: z.boolean().optional(),
      allowResponseEditing: z.boolean().optional(),
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
  blocked: z
    .enum(["expired", "not_open", "target_reached", "limit_reached"])
    .nullish(),
  /** True when this visitor already submitted (unless multiples are allowed). */
  alreadySubmitted: z.boolean(),
  /** Present when the visitor arrived with a valid edit token. */
  editingResponseId: z.string().uuid().nullable().optional(),
  responseCount: z.number(),
  fields: z.array(fieldOutput),
  theme: themeOutput.nullable(),
});

const getBySlugInput = z.object({
  slug: z.string().min(1).max(255),
  password: z.string().optional(),
  /** Reopen a submission for editing; skips the closed/limit gate. */
  responseToken: z.string().min(16).max(128).optional(),
});

const saveDraftInput = z.object({
  slug: z.string().min(1).max(255),
  password: z.string().optional(),
  /** Existing resume token to keep the same draft (undefined = new draft). */
  token: z.string().min(16).max(128).optional(),
  answers: z.record(z.string(), z.unknown()),
  currentStep: z.number().int().nonnegative().optional(),
  email: z.string().email().max(320).optional(),
});

const getDraftInput = z.object({
  slug: z.string().min(1).max(255),
  token: z.string().min(16).max(128),
});

const deleteDraftInput = getDraftInput;

const editResponseInput = z.object({
  slug: z.string().min(1).max(255),
  password: z.string().optional(),
  token: z.string().min(16).max(128),
});

const updateOwnResponseInput = editResponseInput.extend({
  completedInSeconds: z.number().int().positive().optional(),
  answers: z.record(z.string(), z.unknown()),
  turnstileToken: z.string().optional(),
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

type BlockedState =
  | "not_open"
  | "expired"
  | "target_reached"
  | "limit_reached";

async function responseCount(formId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(responsesTable)
    .where(eq(responsesTable.formId, formId))
    .execute();
  return Number(row?.count ?? 0);
}

/** Parses a settings timestamp, returning null for missing/invalid values. */
function parseSettingDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Returns the state that stops the form accepting new responses.
 *
 * The schedule is an explicit `opensAt`/`closesAt` window; the legacy
 * `expiry` is still honoured as a close date for existing forms. A
 * `responseTarget` is a soft close and `responseLimit` remains the absolute
 * cap, so either can stop submissions with the owner's `closeMessage`.
 */
async function blockedState(
  form: SelectForm,
  currentCount?: number,
): Promise<BlockedState | null> {
  const settings = form.settings ?? {};
  const now = Date.now();

  const opensAt = parseSettingDate(settings.opensAt);
  if (opensAt && now < opensAt.getTime()) {
    return "not_open";
  }

  const closesAt = parseSettingDate(settings.closesAt);
  const legacyExpiry = parseSettingDate(settings.expiry);
  const closeTime = Math.min(
    closesAt?.getTime() ?? Number.POSITIVE_INFINITY,
    legacyExpiry?.getTime() ?? Number.POSITIVE_INFINITY,
  );
  if (closeTime <= now) {
    return "expired";
  }

  const total = currentCount ?? (await responseCount(form.id));
  if (settings.responseTarget && total >= settings.responseTarget) {
    return "target_reached";
  }
  if (settings.responseLimit && total >= settings.responseLimit) {
    return "limit_reached";
  }

  return null;
}

/**
 * A draft is bound to the browser that created it. Visitor id is preferred;
 * the IP hash is the fallback for clients that do not send one. Legacy drafts
 * without either identity cannot be safely claimed and are rejected.
 */
function draftBelongsToVisitor(
  draft: { ipHash: string | null; visitorId: string | null },
  ipHash: string,
  visitorHash: string | null,
): boolean {
  if (draft.visitorId) {
    return visitorHash !== null && draft.visitorId === visitorHash;
  }
  if (draft.ipHash) {
    return draft.ipHash === ipHash;
  }
  return false;
}

/** Loads a response by edit token, scoped to the form. */
async function findResponseByEditToken(formId: string, token: string) {
  const rows = await db
    .select()
    .from(responsesTable)
    .where(
      and(
        eq(responsesTable.formId, formId),
        eq(responsesTable.editToken, token),
      ),
    )
    .limit(1)
    .execute();
  return rows[0] ?? null;
}

/** Rejects a token that has expired. */
function assertEditTokenFresh(response: { editTokenExpiresAt: Date | null }) {
  if (
    response.editTokenExpiresAt &&
    response.editTokenExpiresAt.getTime() < Date.now()
  ) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This edit link has expired",
    });
  }
}

/** Checks the (optional) form password against a submitted attempt. */
async function passwordState(form: SelectForm, password?: string) {
  const stored = form.settings?.password;
  if (!stored) return { locked: false };
  if (password == null || password === "") return { locked: true };
  if (!(await verifyPassword(password, stored))) {
    return { locked: true, incorrect: true };
  }
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
  options: {
    ipHash?: string;
    editingResponseId?: string | null;
  } = {},
): Promise<PublicFormView> {
  const settings = form.settings ?? {};
  const safeSettings = {
    ...settings,
    password: undefined,
    notificationEmail: undefined,
  };
  const theme = await getTheme(form.themeId);
  const total = await responseCount(form.id);

  const base = {
    id: form.id,
    title: form.title,
    description: form.description,
    slug: form.slug,
    visibility: form.visibility,
    listed: form.visibility === "public",
    customDomain: form.customDomain,
    settings: safeSettings,
    responseCount: total,
    alreadySubmitted: false,
    editingResponseId: options.editingResponseId ?? null,
  };

  // A valid edit token reopens the form even after it closed, so a respondent
  // can correct the submission they already own.
  const blocked = options.editingResponseId
    ? null
    : await blockedState(form, total);
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

  const auth = await passwordState(form, password);
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

  let alreadySubmitted = false;
  if (
    !options.editingResponseId &&
    options.ipHash &&
    settings.allowMultipleResponses !== true
  ) {
    const [duplicate] = await db
      .select({ id: responsesTable.id })
      .from(responsesTable)
      .where(
        and(
          eq(responsesTable.formId, form.id),
          eq(responsesTable.ipHash, options.ipHash),
        ),
      )
      .limit(1)
      .execute();
    alreadySubmitted = Boolean(duplicate);
  }

  const fields = await getFieldsForForm(form.id);
  return {
    ...base,
    alreadySubmitted,
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

/**
 * Resolves a response edit token for a slug, returning the response row when
 * it is valid. Used by both the renderer (to reopen a closed form) and the
 * edit endpoint.
 */
async function resolveEditResponse(
  form: SelectForm,
  token: string | undefined,
) {
  if (!token) return null;
  if (form.settings?.allowResponseEditing === false) return null;
  const response = await findResponseByEditToken(form.id, token);
  if (!response) return null;
  assertEditTokenFresh(response);
  return response;
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

      if (form.settings?.password) {
        const passwordLimited = await rateLimit(
          `formpass:${form.id}:${hashIp(ipKey)}`,
          { limit: 10, windowMs: 15 * 60_000 },
        );
        if (passwordLimited.limited) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many incorrect password attempts, try again later",
          });
        }
      }

      const editResponse = await resolveEditResponse(form, input.responseToken);
      if (input.responseToken && !editResponse) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This edit link is invalid",
        });
      }

      const view = await buildPublicFormView(form, input.password, {
        ipHash: hashIp(ipKey),
        editingResponseId: editResponse?.id ?? null,
      });

      if (view.locked || view.blocked || view.alreadySubmitted || editResponse) {
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
    .query(async ({ ctx, input }) => {
      // Custom-domain forms are reachable without knowing a slug, so the
      // password gate here needs the same budget as the slug entry point.
      const ipKey = ctx.ip ?? "unknown";
      const limited = await rateLimit(`domain:${hashIp(ipKey)}`, {
        limit: 30,
        windowMs: 60_000,
      });
      if (limited.limited) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests, please try again later",
        });
      }

      const domain = normalizeDomain(input.domain);
      // A domain is only served once the owner proved they control it. Without
      // this check any account could point a vhost at someone else's site by
      // writing the column directly.
      const form = await getFormBy(
        and(
          eq(formsTable.customDomain, domain),
          eq(formsTable.customDomainStatus, "verified"),
          eq(formsTable.status, "published"),
          eq(formsTable.archived, false),
        )!,
      );

      if (form.settings?.password) {
        const passwordLimited = await rateLimit(
          `formpass:${form.id}:${hashIp(ipKey)}`,
          { limit: 10, windowMs: 15 * 60_000 },
        );
        if (passwordLimited.limited) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many incorrect password attempts, try again later",
          });
        }
      }

      return buildPublicFormView(form, input.password, {
        ipHash: hashIp(ipKey),
      });
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

      const blocked = await blockedState(form);
      if (blocked) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            blocked === "not_open"
              ? "This form is not open yet"
              : blocked === "expired"
                ? "This form has expired"
                : "This form is no longer accepting responses",
        });
      }

      if (settings.password) {
        if (input.password == null || input.password === "") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This form is password protected",
          });
        }
        if (!(await verifyPassword(input.password, settings.password))) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Incorrect password",
          });
        }
      }

      const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);
      const ipHash = hashIp(ipKey);
      const visitorHash = hashVisitor(ctx.visitorId);

      let token: string;
      let draftId: string;

      if (input.token) {
        const [draft] = await db
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

        if (!draft) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Draft not found",
          });
        }
        if (draft.expiresAt.getTime() < Date.now()) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "This draft has expired",
          });
        }
        if (!draftBelongsToVisitor(draft, ipHash, visitorHash)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This draft belongs to another visitor",
          });
        }

        token = input.token;
        const updated = await db
          .update(formDraftsTable)
          .set({
            answers: input.answers,
            currentStep: input.currentStep ?? 0,
            ipHash,
            visitorId: visitorHash ?? draft.visitorId,
            ...(input.email !== undefined ? { email: input.email } : {}),
            expiresAt,
          })
          .where(eq(formDraftsTable.id, draft.id))
          .returning({ id: formDraftsTable.id })
          .execute();
        draftId = updated[0]!.id;
      } else {
        token = randomBytes(32).toString("hex");
        const inserted = await db
          .insert(formDraftsTable)
          .values({
            formId: form.id,
            resumeToken: token,
            answers: input.answers,
            currentStep: input.currentStep ?? 0,
            ipHash,
            visitorId: visitorHash,
            email: input.email ?? null,
            expiresAt,
          })
          .returning({ id: formDraftsTable.id })
          .execute();
        draftId = inserted[0]!.id;
      }

      void emitDraftSaved({
        form,
        draftId,
        currentStep: input.currentStep ?? 0,
        answeredFields: Object.keys(input.answers).length,
        occurredAt: new Date().toISOString(),
      });

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
    .query(async ({ ctx, input }) => {
      const ipKey = ctx.ip ?? "unknown";
      const limited = await rateLimit(`draftread:${hashIp(ipKey)}`, {
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
      if (
        !draftBelongsToVisitor(
          draft,
          hashIp(ipKey),
          hashVisitor(ctx.visitorId),
        )
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This draft belongs to another visitor",
        });
      }
      return {
        answers: draft.answers ?? {},
        currentStep: draft.currentStep ?? 0,
        expiresAt: draft.expiresAt.toISOString(),
      };
    }),

  /** Delete a saved draft. Bound to the visitor that created it. */
  deleteDraft: publicProcedure
    .input(deleteDraftInput)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const ipKey = ctx.ip ?? "unknown";
      const limited = await rateLimit(`draftdelete:${hashIp(ipKey)}`, {
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
      if (
        !draftBelongsToVisitor(
          draft,
          hashIp(ipKey),
          hashVisitor(ctx.visitorId),
        )
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This draft belongs to another visitor",
        });
      }

      await db
        .delete(formDraftsTable)
        .where(eq(formDraftsTable.id, draft.id))
        .execute();
      return { success: true };
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
        editToken: z.string().optional(),
        editUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Rate limiting happens before any DB lookup or password check. Checking
      // the password first let an attacker guess it with unlimited attempts,
      // because the rejection path returned before ever reaching the limiter.
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

      const form = await loadPublishedForm(input.slug);
      const settings = form.settings ?? {};
      const { password } = input;

      // Separate, much tighter budget for password guesses on protected forms.
      if (settings.password) {
        const passwordLimited = await rateLimit(
          `formpass:${form.id}:${hashIp(ipKey)}`,
          { limit: 10, windowMs: 15 * 60_000 },
        );
        if (passwordLimited.limited) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many incorrect password attempts, try again later",
          });
        }
      }

      const blocked = await blockedState(form);
      if (blocked) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            blocked === "not_open"
              ? "This form is not open yet"
              : blocked === "expired"
                ? "This form has expired"
                : "This form is no longer accepting responses",
        });
      }

      if (settings.password) {
        if (password == null || password === "") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This form is password protected",
          });
        }
        if (!(await verifyPassword(password, settings.password))) {
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

      // Bot heuristics run alongside Turnstile so a deployment without a
      // Turnstile secret is not an open submission endpoint.
      const userAgent = ctx.headers.get("user-agent") ?? "";
      if (!userAgent.trim() || BOT_USER_AGENT.test(userAgent)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This submission looks automated. Please try in a browser.",
        });
      }
      if (
        input.completedInSeconds !== undefined &&
        input.completedInSeconds < MIN_COMPLETION_SECONDS
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That was too quick. Please take a moment and try again.",
        });
      }
      if (
        input.completedInSeconds === undefined &&
        !process.env.TURNSTILE_SECRET_KEY
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not verify this submission. Please reload and try again.",
        });
      }

      const { fields, optionsByField } = await getFieldsForForm(form.id);
      const validatorFields = fields.map((field) =>
        toValidatorField(field, optionsByField.get(field.id)),
      );
      const knownFieldIds = new Set(validatorFields.map((f) => f.id));
      const unknownFieldIds = Object.keys(input.answers).filter(
        (fieldId) => !knownFieldIds.has(fieldId),
      );
      if (unknownFieldIds.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Submission contains unknown fields",
        });
      }

      // Conditional logic is evaluated here with the same rules the renderer
      // uses. Answers for hidden fields are refused rather than stored and
      // counted, and hidden fields are never required.
      const visibleFieldDefs = validatorFields.filter(
        (field) =>
          field.type !== "page_break" &&
          isFieldVisible(field.conditionalLogic, input.answers),
      );
      const visibleFieldIds = new Set(visibleFieldDefs.map((f) => f.id));
      const hiddenAnswered = Object.keys(input.answers).filter(
        (fieldId) => !visibleFieldIds.has(fieldId),
      );
      if (hiddenAnswered.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Answers were submitted for fields that are hidden by the form logic",
        });
      }

      const filteredAnswers = Object.fromEntries(
        Object.entries(input.answers).filter(([fieldId]) =>
          visibleFieldIds.has(fieldId),
        ),
      );
      const responseSchema = buildResponseSchema(visibleFieldDefs);

      const result = responseSchema.safeParse(filteredAnswers);
      if (!result.success) {
        const issues = result.error.issues.map(
          (issue) => `${issue.path.join(".")}: ${issue.message}`,
        );
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid submission: ${issues.join("; ")}`,
        });
      }

      // File uploads: the client-supplied `fileId` is treated as a claim, not
      // as fact. Each one is resolved against a real upload row that belongs to
      // this form and has not already been claimed by another submission, and
      // the stored answer is rebuilt from that row. A fabricated id, an upload
      // made for a different form, or an arbitrary external URL cannot survive
      // this and would otherwise be rendered to the owner as a download link.
      const fileFields = visibleFieldDefs.filter((f) => f.type === "file_upload");
      const claimedUploads: { id: string }[] = [];

      for (const field of fileFields) {
        const answer = result.data[field.id];
        if (answer === undefined || answer === null) continue;

        const fileId =
          typeof answer === "object" && !Array.isArray(answer) && "fileId" in answer
            ? (answer as { fileId: unknown }).fileId
            : undefined;
        if (typeof fileId !== "string") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid file upload for "${field.label}"`,
          });
        }

        const [upload] = await db
          .select({
            id: formFileUploadsTable.id,
            originalName: formFileUploadsTable.originalName,
            mimeType: formFileUploadsTable.mimeType,
            size: formFileUploadsTable.size,
            storedName: formFileUploadsTable.storedName,
          })
          .from(formFileUploadsTable)
          .where(
            and(
              eq(formFileUploadsTable.id, fileId),
              eq(formFileUploadsTable.formId, form.id),
              // Already-claimed uploads belong to the submission that took them.
              isNull(formFileUploadsTable.responseId),
            ),
          )
          .limit(1)
          .execute();

        if (!upload) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `The file uploaded for "${field.label}" could not be found. Please upload it again.`,
          });
        }

        result.data[field.id] = FileAnswerValueSchema.parse({
          fileId: upload.id,
          name: upload.originalName,
          size: upload.size,
          mimeType: upload.mimeType,
          url: signUploadPath(upload.storedName),
        });
        claimedUploads.push({ id: upload.id });
      }

      // Payment fields: every one must have a verified, unused Razorpay
      // payment. The payment answer is rebuilt server-side from the order we
      // created, never trusted from the client payload.
      const paymentFields = visibleFieldDefs.filter(
        (f) => f.type === "payment",
      );
      // The full payment row is kept so the `payment.paid` webhook that fires
      // after the commit carries the amount and provider ids without a re-read.
      const pendingPayments: {
        row: {
          id: string;
          status: "created" | "paid" | "failed" | "refunded";
          amountPaise: number;
          currency: string;
          razorpayOrderId: string;
          razorpayPaymentId: string | null;
        };
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
              // Carried so the `payment.paid` webhook emitted after the commit
              // can name the order and provider payment without a second read.
              razorpayOrderId: formPaymentsTable.razorpayOrderId,
              razorpayPaymentId: formPaymentsTable.razorpayPaymentId,
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

          // Currency-aware conversion: JPY has no minor unit, KWD has three.
          const expectedPaise = toMinorUnits(
            field.validationRules?.amount ?? 0,
            paymentRow.currency,
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
            amount: fromMinorUnits(expectedPaise, paymentRow.currency),
            currency: paymentRow.currency,
            status: "paid",
          });
          result.data[field.id] = answer;
          pendingPayments.push({ row: paymentRow, answer });
        }
      }

      const ownerEntitlements = (
        await getUserEntitlements(form.ownerId)
      ).entitlements;

      const editToken =
        settings.allowResponseEditing === false
          ? null
          : randomBytes(32).toString("hex");
      const ipHash = hashIp(ipKey);

      const responseId = await db.transaction(async (tx) => {
        const { device, browser } = parseUserAgent(ctx.headers.get("user-agent"));

        // Serialize submissions from the same visitor so two concurrent
        // requests cannot both pass the duplicate check.
        if (settings.allowMultipleResponses !== true) {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${`${form.id}:${ipHash}`}))`,
          );
          const [duplicate] = await tx
            .select({ id: responsesTable.id })
            .from(responsesTable)
            .where(
              and(
                eq(responsesTable.formId, form.id),
                eq(responsesTable.ipHash, ipHash),
              ),
            )
            .limit(1)
            .execute();
          if (duplicate) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "You have already submitted this form",
            });
          }
        }

        // Re-check the count under a form-scoped lock so a burst of concurrent
        // submissions cannot push the form past its target/limit.
        if (settings.responseTarget || settings.responseLimit) {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${`form-count:${form.id}`}))`,
          );
          const [countRow] = await tx
            .select({ count: count() })
            .from(responsesTable)
            .where(eq(responsesTable.formId, form.id))
            .execute();
          const total = Number(countRow?.count ?? 0);
          if (settings.responseTarget && total >= settings.responseTarget) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "This form has reached its response target",
            });
          }
          if (settings.responseLimit && total >= settings.responseLimit) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "This form has reached its response limit",
            });
          }
        }

        // Counted inside the transaction so a later failure (e.g. a payment
        // constraint) rolls the counter back along with the response.
        await consumeResponseQuota(tx, form.ownerId, ownerEntitlements);

        const inserted = await tx
          .insert(responsesTable)
          .values({
            formId: form.id,
            ipHash,
            completedInSeconds: input.completedInSeconds ?? null,
            device,
            browser,
            editToken,
            editTokenExpiresAt: editToken
              ? new Date(Date.now() + EDIT_TOKEN_TTL_MS)
              : null,
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

        // Claim the uploads only now that the response row exists. The
        // `response_id IS NULL` guard means a second submission racing for the
        // same upload loses and rolls back instead of stealing it.
        for (const upload of claimedUploads) {
          const claimed = await tx
            .update(formFileUploadsTable)
            .set({ responseId: response.id })
            .where(
              and(
                eq(formFileUploadsTable.id, upload.id),
                isNull(formFileUploadsTable.responseId),
              ),
            )
            .returning({ id: formFileUploadsTable.id })
            .execute();

          if (!claimed[0]) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "This upload was already submitted. Please upload it again.",
            });
          }
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
        fields: visibleFieldDefs,
        answers: result.data,
        responseId: responseId.id,
        submittedAt: responseId.submittedAt.toISOString(),
      });

      // Captured payments only become real once the response transaction
      // commits, so `payment.paid` is emitted here rather than inside it.
      const paidAt = new Date().toISOString();
      for (const payment of pendingPayments) {
        void emitPaymentEvent("payment.paid", {
          form,
          paymentId: payment.row.id,
          orderId: payment.row.razorpayOrderId,
          razorpayPaymentId: payment.row.razorpayPaymentId,
          amountPaise: payment.row.amountPaise,
          currency: payment.row.currency,
          status: "paid",
          responseId: responseId.id,
          occurredAt: paidAt,
        });
      }

      void emitResponseCreated({
        form,
        fields: visibleFieldDefs,
        answers: result.data,
        responseId: responseId.id,
        submittedAt: responseId.submittedAt.toISOString(),
      });

      return {
        success: true,
        responseId: responseId.id,
        ...(editToken
          ? {
              editToken,
              editUrl: `/form/${form.slug}?response=${editToken}`,
            }
          : {}),
      };
    }),

  /** Load the answers behind a respondent's edit link. */
  getResponseForEdit: publicProcedure
    .input(editResponseInput)
    .output(
      z.object({
        responseId: z.string().uuid(),
        answers: z.record(z.string(), z.unknown()),
        submittedAt: z.string(),
        editedAt: z.string().nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const ipKey = ctx.ip ?? "unknown";
      const limited = await rateLimit(`editread:${hashIp(ipKey)}`, {
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
      if (form.settings?.allowResponseEditing === false) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Response editing is disabled for this form",
        });
      }
      if (form.settings?.password) {
        if (!input.password) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This form is password protected",
          });
        }
        if (!(await verifyPassword(input.password, form.settings.password))) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Incorrect password",
          });
        }
      }

      const response = await findResponseByEditToken(form.id, input.token);
      if (!response) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This edit link is invalid",
        });
      }
      assertEditTokenFresh(response);

      const answerRows = await db
        .select()
        .from(answersTable)
        .where(eq(answersTable.responseId, response.id))
        .execute();

      return {
        responseId: response.id,
        answers: Object.fromEntries(
          answerRows.map((answer) => [answer.fieldId, answer.value]),
        ),
        submittedAt: response.submittedAt.toISOString(),
        editedAt: response.editedAt ? response.editedAt.toISOString() : null,
      };
    }),

  /**
   * Update a response through the respondent's edit token. File and payment
   * answers reference rows already claimed by the original submission, so they
   * stay immutable, exactly like the owner-facing response editor.
   */
  updateOwnResponse: publicProcedure
    .input(updateOwnResponseInput)
    .output(
      z.object({
        success: z.boolean(),
        responseId: z.string().uuid(),
        editedAt: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ipKey = ctx.ip ?? "unknown";
      const limited = await rateLimit(`edit:${hashIp(ipKey)}`, {
        limit: 10,
        windowMs: 60_000,
      });
      if (limited.limited) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many edits, please try again later",
        });
      }

      const form = await loadPublishedForm(input.slug);
      if (form.settings?.allowResponseEditing === false) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Response editing is disabled for this form",
        });
      }
      if (form.settings?.password) {
        if (!input.password) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This form is password protected",
          });
        }
        if (!(await verifyPassword(input.password, form.settings.password))) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Incorrect password",
          });
        }
      }

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

      const response = await findResponseByEditToken(form.id, input.token);
      if (!response) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This edit link is invalid",
        });
      }
      assertEditTokenFresh(response);

      const { fields, optionsByField } = await getFieldsForForm(form.id);
      const validatorFields = fields.map((field) =>
        toValidatorField(field, optionsByField.get(field.id)),
      );
      const knownFieldIds = new Set(validatorFields.map((f) => f.id));
      const unknownFieldIds = Object.keys(input.answers).filter(
        (fieldId) => !knownFieldIds.has(fieldId),
      );
      if (unknownFieldIds.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Submission contains unknown fields",
        });
      }

      const immutable = new Set(["file_upload", "payment", "page_break"]);
      const editableFieldIds = validatorFields
        .filter((field) => !immutable.has(field.type))
        .map((field) => field.id);
      const editableFieldIdSet = new Set(editableFieldIds);

      const visibleFieldDefs = validatorFields.filter(
        (field) =>
          field.type !== "page_break" &&
          isFieldVisible(field.conditionalLogic, input.answers),
      );
      const visibleFieldIds = new Set(visibleFieldDefs.map((f) => f.id));
      // Immutable answers (files/payments) are replayed from the original
      // submission and are not part of this validation.
      const hiddenAnswered = Object.keys(input.answers).filter(
        (fieldId) =>
          editableFieldIdSet.has(fieldId) && !visibleFieldIds.has(fieldId),
      );
      if (hiddenAnswered.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Answers were submitted for fields that are hidden by the form logic",
        });
      }
      const editableVisibleFieldDefs = visibleFieldDefs.filter(
        (field) => !immutable.has(field.type),
      );
      const editableAnswers = Object.fromEntries(
        Object.entries(input.answers).filter(([fieldId]) =>
          visibleFieldIds.has(fieldId),
        ),
      );

      const parsed = buildResponseSchema(editableVisibleFieldDefs).safeParse(
        editableAnswers,
      );
      if (!parsed.success) {
        const issues = parsed.error.issues.map(
          (issue) => `${issue.path.join(".")}: ${issue.message}`,
        );
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid submission: ${issues.join("; ")}`,
        });
      }

      const editedAt = new Date();
      await db.transaction(async (tx) => {
        if (editableFieldIds.length > 0) {
          await tx
            .delete(answersTable)
            .where(
              and(
                eq(answersTable.responseId, response.id),
                inArray(answersTable.fieldId, editableFieldIds),
              ),
            )
            .execute();
        }

        const rows = Object.entries(parsed.data)
          .filter(([, value]) => value !== undefined)
          .map(([fieldId, value]) => ({
            responseId: response.id,
            fieldId,
            value: (value ?? null) as z.infer<typeof AnswerValueSchema> | null,
          }));
        if (rows.length > 0) {
          await tx.insert(answersTable).values(rows).execute();
        }

        await tx
          .update(responsesTable)
          .set({ editedAt })
          .where(eq(responsesTable.id, response.id))
          .execute();
      });

      const finalAnswers = await db
        .select()
        .from(answersTable)
        .where(eq(answersTable.responseId, response.id))
        .execute();

      void emitResponseUpdated({
        form,
        fields: validatorFields,
        answers: Object.fromEntries(
          finalAnswers.map((answer) => [answer.fieldId, answer.value]),
        ),
        responseId: response.id,
        submittedAt: response.submittedAt.toISOString(),
      });

      return {
        success: true,
        responseId: response.id,
        editedAt: editedAt.toISOString(),
      };
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

      // Explore shows ordinary published forms plus any template an operator
      // has featured. Templates are authored as drafts, so requiring
      // `status = published` everywhere would make featuring one a no-op.
      const publishable = or(
        and(eq(formsTable.isTemplate, false), eq(formsTable.status, "published")),
        and(eq(formsTable.isTemplate, true), eq(formsTable.isFeatured, true)),
      )!;

      const conditions = [
        publishable,
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
      const where = and(...conditions);

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
        .where(where)
        .groupBy(formsTable.id, themesTable.id)
        .orderBy(desc(formsTable.isFeatured), desc(formsTable.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute();

      const [totalRow] = await db
        .select({ total: count() })
        .from(formsTable)
        .where(where)
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
