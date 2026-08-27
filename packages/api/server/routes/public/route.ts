import { createHash } from "node:crypto";
import { z } from "zod";
import { db, eq, and, desc, count, ilike } from "@repo/db";
import {
  answersTable,
  formsTable,
  responsesTable,
  themesTable,
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
    })
    .optional(),
  requiresPassword: z.boolean(),
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
});

/** Load a form and enforce the server-side access rules. */
async function resolveAccessibleForm(
  slug: string,
  password?: string,
) {
  const form = await getFormBy(
    and(
      eq(formsTable.slug, slug),
      eq(formsTable.status, "published"),
      eq(formsTable.archived, false),
    )!,
  );

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
    if (password == null || password === "") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This form is password protected",
      });
    }
    if (settings.password !== password) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Incorrect password",
      });
    }
  }

  return form;
}

export const publicRouter = router({
  /** Fetch a published form by slug for the public renderer. */
  getFormBySlug: publicProcedure
    .meta({
      openapi: { method: "GET", path: "/public/forms/{slug}", tags: TAGS },
    })
    .input(getBySlugInput)
    .output(publicFormViewOutput)
    .query(async ({ input }) => {
      const form = await resolveAccessibleForm(input.slug, input.password);
      const fields = await getFieldsForForm(form.id);
      const theme = await getTheme(form.themeId);

      const { password: _password, ...safeSettings } = form.settings ?? {};

      return {
        id: form.id,
        title: form.title,
        description: form.description,
        slug: form.slug,
        visibility: form.visibility,
        settings: safeSettings,
        requiresPassword: !!_password,
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
      const form = await resolveAccessibleForm(input.slug, input.password);

      const settings = form.settings ?? {};

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
      const limited = rateLimit(`submit:${hashIp(ipKey)}`, {
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
        const inserted = await tx
          .insert(responsesTable)
          .values({
            formId: form.id,
            ipHash: hashIp(ipKey),
            completedInSeconds: input.completedInSeconds ?? null,
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

        return response.id;
      });

      return { success: true, responseId };
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
        .orderBy(desc(formsTable.createdAt))
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