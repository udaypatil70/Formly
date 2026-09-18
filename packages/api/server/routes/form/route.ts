import { z } from "zod";
import { db, eq, and, desc, count, countDistinct, max, inArray, ne } from "@repo/db";
import {
  fieldOptionsTable,
  fieldsTable,
  formsTable,
  responsesTable,
  formViewsTable,
  formVersionsTable,
  type FormVersionField,
} from "@repo/db/schema";
import { TRPCError } from "@trpc/server";
import {
  CreateFormInput,
  UpdateFormInput,
  type CreateFieldInput,
  type Field,
} from "@repo/validators";
import { router, publicProcedure, protectedProcedure } from "../../trpc";
import { getFormBy, getTheme, getValidatorFields, normalizeDomain } from "../../utils/form";
import { slugify, ensureUniqueSlug, isSlugAvailable } from "../../utils/slug";
import { hashPassword } from "../../utils/password";
import { serializeForm, serializeTheme } from "../../utils/serialize";
import {
  formDetailOutput,
  formMetaOutput,
  formWithCountsOutput,
} from "../../utils/schemas";

const TAGS = ["Forms"];

/** The transaction object type handed to `db.transaction(cb)`. */
type DB =
  Parameters<typeof db.transaction>[0] extends (tx: infer T) => unknown
    ? T
    : never;

export type { DB };

/** Create input: slug is optional (auto-generated from title). */
const createFormInput = CreateFormInput.extend({
  slug: CreateFormInput.shape.slug.optional(),
});

const updateFormInput = UpdateFormInput.extend({
  id: z.string().uuid(),
});

const idInput = z.object({ id: z.string().uuid() });
const slugInput = z.object({ slug: z.string().min(1).max(255) });

/** Insert fields + their options inside a transaction. */
export async function insertFields(
  tx: DB,
  formId: string,
  fields: CreateFieldInput[],
) {
  for (const field of fields) {
    const inserted = await tx
      .insert(fieldsTable)
      .values({
        formId,
        type: field.type,
        label: field.label,
        placeholder: field.placeholder ?? null,
        helpText: field.helpText ?? null,
        required: field.required ?? false,
        order: field.order,
        validationRules: field.validationRules ?? {},
        conditionalLogic: field.conditionalLogic ?? {},
      })
      .returning()
      .execute();

    const created = inserted[0]!;

    if (field.options && field.options.length > 0) {
      await tx
        .insert(fieldOptionsTable)
        .values(
          field.options.map((option) => ({
            fieldId: created.id,
            label: option.label,
            value: option.value,
            order: option.order,
          })),
        )
        .execute();
    }
  }
}

/** Throws FORBIDDEN when the form isn't owned by the current user. */
export async function assertFormOwner(formId: string, userId: string) {
  const form = await getFormBy(eq(formsTable.id, formId));
  if (form.ownerId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this form",
    });
  }
  return form;
}

/** Snapshot shape: validator Field -> JSON form version field. */
function toVersionField(field: Field): FormVersionField {
  return {
    id: field.id,
    type: field.type,
    label: field.label,
    placeholder: field.placeholder ?? null,
    helpText: field.helpText ?? null,
    required: field.required,
    order: field.order,
    validationRules: field.validationRules ?? null,
    conditionalLogic: field.conditionalLogic ?? null,
    options:
      field.options?.map((o) => ({ label: o.label, value: o.value, order: o.order })) ??
      null,
  };
}

export const formRouter = router({
  /** Create a new form (optionally with its fields). */
  create: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/forms", tags: TAGS } })
    .input(createFormInput)
    .output(formMetaOutput)
    .mutation(async ({ ctx, input }) => {
      const slug = input.slug?.trim().length
        ? input.slug
        : slugify(input.title) || "untitled-form";
      const finalSlug = await ensureUniqueSlug(slug);

      try {
        const form = await db.transaction(async (tx) => {
          const inserted = await tx
            .insert(formsTable)
            .values({
              ownerId: ctx.user.id,
              title: input.title,
              description: input.description ?? null,
              slug: finalSlug,
              visibility: input.visibility ?? "public",
              themeId: input.themeId ?? null,
              settings: input.settings
                ? {
                    ...input.settings,
                    password: input.settings.password
                      ? hashPassword(input.settings.password)
                      : undefined,
                  }
                : {},
            })
            .returning()
            .execute();

          const created = inserted[0]!;
          if (input.fields?.length) {
            await insertFields(tx, created.id, input.fields);
          }
          return created;
        });

        return serializeForm(form);
      } catch (error) {
        if (
          typeof error === "object" &&
          error &&
          "code" in error &&
          error.code === "23505"
        ) {
          throw new TRPCError({ code: "CONFLICT", message: "Slug already taken" });
        }
        throw error;
      }
    }),

  /** List forms owned by the current user, with response & view counts. */
  getAllMine: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/forms", tags: TAGS } })
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        includeArchived: z.boolean().default(false),
      }),
    )
    .output(
      z.object({
        forms: z.array(formWithCountsOutput),
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize } = input;
      const conditions = [
        eq(formsTable.ownerId, ctx.user.id),
        input.includeArchived
          ? eq(formsTable.archived, true)
          : eq(formsTable.archived, false),
      ];

      const rows = await db
        .select({
          form: formsTable,
          responseCount: countDistinct(responsesTable.id),
          viewCount: countDistinct(formViewsTable.id),
        })
        .from(formsTable)
        .where(and(...conditions))
        .leftJoin(responsesTable, eq(responsesTable.formId, formsTable.id))
        .leftJoin(formViewsTable, eq(formViewsTable.formId, formsTable.id))
        .groupBy(formsTable.id)
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
          ...serializeForm(row.form),
          responseCount: Number(row.responseCount),
          viewCount: Number(row.viewCount),
        })),
        total: Number(totalRow?.total ?? 0),
        page,
        pageSize,
      };
    }),

  /** Get a single form with all fields + theme (owner only). */
  getById: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/forms/{id}", tags: TAGS } })
    .input(idInput)
    .output(formDetailOutput)
    .query(async ({ ctx, input }) => {
      const form = await assertFormOwner(input.id, ctx.user.id);
      const fields = await getValidatorFields(form.id);
      const theme = await getTheme(form.themeId);
      return {
        form: serializeForm(form),
        fields,
        theme: serializeTheme(theme),
      };
    }),

  /** Get a form by slug for the builder's preview pane (owner only). */
  getBySlug: protectedProcedure
    .meta({
      openapi: { method: "GET", path: "/forms/slug/{slug}", tags: TAGS },
    })
    .input(slugInput)
    .output(formDetailOutput)
    .query(async ({ ctx, input }) => {
      const form = await getFormBy(eq(formsTable.slug, input.slug));
      if (form.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your form" });
      }
      const fields = await getValidatorFields(form.id);
      const theme = await getTheme(form.themeId);
      return {
        form: serializeForm(form),
        fields,
        theme: serializeTheme(theme),
      };
    }),

  /** Update form metadata (title, slug, visibility, theme, settings). */
  update: protectedProcedure
    .meta({ openapi: { method: "PATCH", path: "/forms/{id}", tags: TAGS } })
    .input(updateFormInput)
    .output(formMetaOutput)
    .mutation(async ({ ctx, input }) => {
      const form = await assertFormOwner(input.id, ctx.user.id);

      if (input.slug && input.slug !== form.slug) {
        const available = await isSlugAvailable(input.slug);
        if (!available) {
          throw new TRPCError({ code: "CONFLICT", message: "Slug already taken" });
        }
      }

      let nextCustomDomain = form.customDomain;
      if (input.customDomain !== undefined) {
        const raw = input.customDomain?.trim() || "";
        nextCustomDomain = raw ? normalizeDomain(raw) : null;
        if (nextCustomDomain && nextCustomDomain !== form.customDomain) {
          const conflict = await db
            .select({ id: formsTable.id })
            .from(formsTable)
            .where(
              and(
                eq(formsTable.customDomain, nextCustomDomain),
                ne(formsTable.id, input.id),
              ),
            )
            .limit(1)
            .execute();
          if (conflict.length > 0) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Custom domain already in use",
            });
          }
        }
      }

      const baseSettings = input.settings ?? form.settings;
      const nextSettings = { ...(baseSettings ?? {}) };
      if (nextSettings.password) {
        nextSettings.password = hashPassword(nextSettings.password as string);
      }

      const updated = await db
        .update(formsTable)
        .set({
          title: input.title ?? form.title,
          description:
            input.description !== undefined ? input.description : form.description,
          slug: input.slug ?? form.slug,
          visibility: input.visibility ?? form.visibility,
          themeId: input.themeId !== undefined ? input.themeId : form.themeId,
          customDomain: nextCustomDomain,
          settings: nextSettings,
        })
        .where(eq(formsTable.id, input.id))
        .returning()
        .execute();

      return serializeForm(updated[0]!);
    }),

  /** Publish a form. */
  publish: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/forms/{id}/publish", tags: TAGS } })
    .input(idInput)
    .output(formMetaOutput)
    .mutation(async ({ ctx, input }) => {
      await assertFormOwner(input.id, ctx.user.id);
      const updated = await db
        .update(formsTable)
        .set({ status: "published", archived: false, updatedAt: new Date() })
        .where(eq(formsTable.id, input.id))
        .returning()
        .execute();
      return serializeForm(updated[0]!);
    }),

  /** Unpublish a form (still editable). */
  unpublish: protectedProcedure
    .meta({
      openapi: { method: "POST", path: "/forms/{id}/unpublish", tags: TAGS },
    })
    .input(idInput)
    .output(formMetaOutput)
    .mutation(async ({ ctx, input }) => {
      await assertFormOwner(input.id, ctx.user.id);
      const updated = await db
        .update(formsTable)
        .set({ status: "unpublished", updatedAt: new Date() })
        .where(eq(formsTable.id, input.id))
        .returning()
        .execute();
      return serializeForm(updated[0]!);
    }),

  /** Clone a form (deep copies fields + options). */
  clone: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/forms/{id}/clone", tags: TAGS } })
    .input(idInput)
    .output(formMetaOutput)
    .mutation(async ({ ctx, input }) => {
      const source = await assertFormOwner(input.id, ctx.user.id);
      const { password: _password, ...cloneSettings } = source.settings ?? {};

      return db.transaction(async (tx) => {
        const newSlug = await ensureUniqueSlug(`${source.slug}-copy`);
        const inserted = await tx
          .insert(formsTable)
          .values({
            ownerId: ctx.user.id,
            title: `${source.title} (copy)`,
            description: source.description,
            slug: newSlug,
            status: "draft",
            visibility: source.visibility,
            archived: false,
            themeId: source.themeId,
            settings: cloneSettings,
          })
          .returning()
          .execute();

        const clone = inserted[0]!;
        const fields = await getValidatorFields(source.id);
        await insertFields(
          tx,
          clone.id,
          fields.map((f) => ({
            type: f.type,
            label: f.label,
            placeholder: f.placeholder,
            helpText: f.helpText,
            required: f.required,
            order: f.order,
            validationRules: f.validationRules,
            conditionalLogic: f.conditionalLogic,
            options: f.options?.map((o) => ({
              label: o.label,
              value: o.value,
              order: o.order,
            })),
          })),
        );
        return serializeForm(clone);
      });
    }),

  /** Archive a form. */
  archive: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/forms/{id}/archive", tags: TAGS } })
    .input(idInput)
    .output(formMetaOutput)
    .mutation(async ({ ctx, input }) => {
      await assertFormOwner(input.id, ctx.user.id);
      const updated = await db
        .update(formsTable)
        .set({ archived: true, status: "unpublished", updatedAt: new Date() })
        .where(eq(formsTable.id, input.id))
        .returning()
        .execute();
      return serializeForm(updated[0]!);
    }),

  /** Restore an archived form. */
  restore: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/forms/{id}/restore", tags: TAGS } })
    .input(idInput)
    .output(formMetaOutput)
    .mutation(async ({ ctx, input }) => {
      await assertFormOwner(input.id, ctx.user.id);
      const updated = await db
        .update(formsTable)
        .set({ archived: false, updatedAt: new Date() })
        .where(eq(formsTable.id, input.id))
        .returning()
        .execute();
      return serializeForm(updated[0]!);
    }),

  /** Delete a form permanently (cascades fields, responses, views). */
  delete: protectedProcedure
    .meta({ openapi: { method: "DELETE", path: "/forms/{id}", tags: TAGS } })
    .input(idInput)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertFormOwner(input.id, ctx.user.id);
      await db.delete(formsTable).where(eq(formsTable.id, input.id)).execute();
      return { success: true };
    }),

  /** Check whether a slug is available. */
  checkSlug: publicProcedure
    .meta({
      openapi: { method: "GET", path: "/forms/check-slug/{slug}", tags: TAGS },
    })
    .input(slugInput)
    .output(z.object({ slug: z.string(), available: z.boolean() }))
    .query(async ({ input }) => {
      const available = await isSlugAvailable(input.slug);
      return { slug: input.slug, available };
    }),

  /** List version snapshots for a form (newest first). */
  versionsList: protectedProcedure
    .input(idInput)
    .output(
      z.array(
        z.object({
          id: z.string(),
          version: z.number(),
          label: z.string().nullable(),
          title: z.string(),
          createdAt: z.string(),
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      await assertFormOwner(input.id, ctx.user.id);
      const rows = await db
        .select()
        .from(formVersionsTable)
        .where(eq(formVersionsTable.formId, input.id))
        .orderBy(desc(formVersionsTable.version))
        .execute();
      return rows.map((row) => ({
        id: row.id,
        version: row.version,
        label: row.label ?? null,
        title: row.title,
        createdAt: row.createdAt.toISOString(),
      }));
    }),

  /** Fetch the full snapshot for a single version. */
  versionsGet: protectedProcedure
    .input(idInput)
    .output(
      z.object({
        id: z.string(),
        version: z.number(),
        label: z.string().nullable(),
        title: z.string(),
        description: z.string().nullable(),
        themeId: z.string().uuid().nullable(),
        settings: z.record(z.string(), z.unknown()),
        fields: z.array(z.unknown()),
        createdAt: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select()
        .from(formVersionsTable)
        .where(eq(formVersionsTable.id, input.id))
        .limit(1)
        .execute();
      const version = rows[0];
      if (!version) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }
      await assertFormOwner(version.formId, ctx.user.id);
      return {
        id: version.id,
        version: version.version,
        label: version.label ?? null,
        title: version.title,
        description: version.description ?? null,
        themeId: version.themeId ?? null,
        settings: version.settings ?? {},
        fields: version.fields,
        createdAt: version.createdAt.toISOString(),
      };
    }),

  /** Create a version snapshot of the form's current state. */
  versionsSave: protectedProcedure
    .input(
      z.object({
        formId: z.string().uuid(),
        label: z.string().max(255).optional(),
      }),
    )
    .output(
      z.object({
        id: z.string(),
        version: z.number(),
        createdAt: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const form = await assertFormOwner(input.formId, ctx.user.id);
      const fields = await getValidatorFields(form.id);

      const [maxRow] = await db
        .select({ max: max(formVersionsTable.version) })
        .from(formVersionsTable)
        .where(eq(formVersionsTable.formId, form.id))
        .execute();
      const nextVersion = Number(maxRow?.max ?? 0) + 1;

      const inserted = await db
        .insert(formVersionsTable)
        .values({
          formId: form.id,
          version: nextVersion,
          label: input.label?.trim() || null,
          title: form.title,
          description: form.description,
          themeId: form.themeId,
          settings: form.settings ?? {},
          fields: fields.map(toVersionField),
        })
        .returning()
        .execute();

      const created = inserted[0]!;
      return {
        id: created.id,
        version: created.version,
        createdAt: created.createdAt.toISOString(),
      };
    }),

  /** Restore a form to a previous version snapshot. */
  versionsRestore: protectedProcedure
    .input(idInput)
    .output(formMetaOutput)
    .mutation(async ({ ctx, input }) => {
      const rows = await db
        .select()
        .from(formVersionsTable)
        .where(eq(formVersionsTable.id, input.id))
        .limit(1)
        .execute();
      const version = rows[0];
      if (!version) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }
      await assertFormOwner(version.formId, ctx.user.id);

      return db.transaction(async (tx) => {
        const existing = await tx
          .select({ id: fieldsTable.id })
          .from(fieldsTable)
          .where(eq(fieldsTable.formId, version.formId))
          .execute();
        if (existing.length > 0) {
          await tx
            .delete(fieldOptionsTable)
            .where(
              inArray(
                fieldOptionsTable.fieldId,
                existing.map((f) => f.id),
              ),
            )
            .execute();
          await tx
            .delete(fieldsTable)
            .where(eq(fieldsTable.formId, version.formId))
            .execute();
        }

        for (const field of version.fields) {
          const inserted = await tx
            .insert(fieldsTable)
            .values({
              formId: version.formId,
              type: field.type as never,
              label: field.label,
              placeholder: field.placeholder,
              helpText: field.helpText,
              required: field.required,
              order: field.order,
              validationRules: field.validationRules ?? {},
              conditionalLogic: field.conditionalLogic ?? {},
            })
            .returning()
            .execute();
          const created = inserted[0]!;
          if (field.options && field.options.length > 0) {
            await tx
              .insert(fieldOptionsTable)
              .values(
                field.options.map((option) => ({
                  fieldId: created.id,
                  label: option.label,
                  value: option.value,
                  order: option.order,
                })),
              )
              .execute();
          }
        }

        const updated = await tx
          .update(formsTable)
          .set({
            title: version.title,
            description: version.description,
            themeId: version.themeId,
            settings: version.settings ?? {},
            updatedAt: new Date(),
          })
          .where(eq(formsTable.id, version.formId))
          .returning()
          .execute();

        return serializeForm(updated[0]!);
      });
    }),
});