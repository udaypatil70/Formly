import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  text,
  integer,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./user";

// ─── Enums ────────────────────────────────────────────────

export const formStatusEnum = pgEnum("form_status", [
  "draft",
  "published",
  "unpublished",
]);

export const formVisibilityEnum = pgEnum("form_visibility", [
  "public",
  "unlisted",
]);

export const fieldTypeEnum = pgEnum("field_type", [
  "short_text",
  "long_text",
  "email",
  "number",
  "single_select",
  "multi_select",
  "checkbox",
  "radio",
  "rating",
  "date",
  "page_break",
]);

export const themeCategoryEnum = pgEnum("theme_category", [
  "movies",
  "anime",
  "games",
  "startups",
  "tech",
  "os",
  "events",
  "community",
]);

// ─── Forms ────────────────────────────────────────────────

export const formsTable = pgTable(
  "forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    status: formStatusEnum("status").default("draft").notNull(),
    visibility: formVisibilityEnum("visibility").default("public").notNull(),
    archived: boolean("archived").default(false).notNull(),
    themeId: uuid("theme_id").references(() => themesTable.id, {
      onDelete: "set null",
    }),
    settings: jsonb("settings")
      .$type<{
        password?: string;
        expiry?: string;
        responseLimit?: number;
        thankYouMessage?: string;
        stepMode?: "page" | "question";
      }>()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
  },
  (table) => [
    index("forms_owner_id_idx").on(table.ownerId),
    index("forms_status_idx").on(table.status),
    index("forms_slug_idx").on(table.slug),
  ],
);

// ─── Themes ───────────────────────────────────────────────

export type ThemeBackground =
  | { type: "solid"; color: string }
  | { type: "gradient"; from: string; to: string }
  | { type: "image"; url: string };

export const themesTable = pgTable("themes", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").references(() => usersTable.id, {
    onDelete: "cascade",
  }),
  name: varchar("name", { length: 100 }).notNull(),
  category: themeCategoryEnum("category").default("community").notNull(),
  font: varchar("font", { length: 100 }),
  colors: jsonb("colors")
    .$type<{
      primary: string;
      background: string;
      surface: string;
      text: string;
    }>()
    .notNull(),
  background: jsonb("background").$type<ThemeBackground>(),
});

// ─── Fields ───────────────────────────────────────────────

export const fieldsTable = pgTable(
  "fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => formsTable.id, { onDelete: "cascade" }),
    type: fieldTypeEnum("type").notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    placeholder: varchar("placeholder", { length: 255 }),
    helpText: varchar("help_text", { length: 500 }),
    required: boolean("required").default(false).notNull(),
    order: integer("order").notNull(),
    validationRules: jsonb("validation_rules")
      .$type<{
        minLength?: number;
        maxLength?: number;
        min?: number;
        max?: number;
        pattern?: string;
      }>()
      .default({}),
    conditionalLogic: jsonb("conditional_logic")
      .$type<{
        showIf?: {
          fieldId: string;
          operator:
            | "equals"
            | "not_equals"
            | "contains"
            | "greater_than"
            | "less_than";
          value: string | number | boolean;
        };
      }>()
      .default({}),
  },
  (table) => [
    index("fields_form_id_idx").on(table.formId),
    index("fields_form_id_order_idx").on(table.formId, table.order),
  ],
);

// ─── Field Options ────────────────────────────────────────

export const fieldOptionsTable = pgTable(
  "field_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fieldsTable.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 255 }).notNull(),
    value: varchar("value", { length: 255 }).notNull(),
    order: integer("order").notNull(),
  },
  (table) => [
    index("field_options_field_id_idx").on(table.fieldId),
    index("field_options_field_id_order_idx").on(table.fieldId, table.order),
  ],
);

// ─── Responses ────────────────────────────────────────────

export const responsesTable = pgTable(
  "responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => formsTable.id, { onDelete: "cascade" }),
    submittedAt: timestamp("submitted_at").defaultNow().notNull(),
    ipHash: varchar("ip_hash", { length: 64 }),
    completedInSeconds: integer("completed_in_seconds"),
  },
  (table) => [
    index("responses_form_id_idx").on(table.formId),
    index("responses_submitted_at_idx").on(table.submittedAt),
    index("responses_ip_hash_idx").on(table.ipHash),
  ],
);

// ─── Answers ──────────────────────────────────────────────

export const answersTable = pgTable(
  "answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => responsesTable.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => fieldsTable.id, { onDelete: "cascade" }),
    value: jsonb("value").$type<string | number | boolean | string[]>(),
  },
  (table) => [
    index("answers_response_id_idx").on(table.responseId),
    index("answers_field_id_idx").on(table.fieldId),
    uniqueIndex("answers_response_field_idx").on(
      table.responseId,
      table.fieldId,
    ),
  ],
);

// ─── Form Views ───────────────────────────────────────────

export const formViewsTable = pgTable(
  "form_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => formsTable.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at").defaultNow().notNull(),
  },
  (table) => [
    index("form_views_form_id_idx").on(table.formId),
    index("form_views_viewed_at_idx").on(table.viewedAt),
  ],
);

// ─── Types ────────────────────────────────────────────────

export type SelectForm = typeof formsTable.$inferSelect;
export type InsertForm = typeof formsTable.$inferInsert;
export type SelectTheme = typeof themesTable.$inferSelect;
export type InsertTheme = typeof themesTable.$inferInsert;
export type SelectField = typeof fieldsTable.$inferSelect;
export type InsertField = typeof fieldsTable.$inferInsert;
export type SelectFieldOption = typeof fieldOptionsTable.$inferSelect;
export type InsertFieldOption = typeof fieldOptionsTable.$inferInsert;
export type SelectResponse = typeof responsesTable.$inferSelect;
export type InsertResponse = typeof responsesTable.$inferInsert;
export type SelectAnswer = typeof answersTable.$inferSelect;
export type InsertAnswer = typeof answersTable.$inferInsert;
export type SelectFormView = typeof formViewsTable.$inferSelect;
export type InsertFormView = typeof formViewsTable.$inferInsert;
