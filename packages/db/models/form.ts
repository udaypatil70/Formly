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
} from "drizzle-orm/pg-core";
import { usersTable } from "./user";

export const formStatusEnum = pgEnum("form_status", [
  "draft",
  "published",
  "unpublished",
]);

export const formVisibilityEnum = pgEnum("form_visibility", ["public", "unlisted"]);

export const fieldTypeEnum = pgEnum("field_type", [
  "short_text",
  "long_text",
  "email",
  "number",
  "single_select",
  "multi_select",
  "checkbox",
  "rating",
  "date",
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

export const formsTable = pgTable("forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  status: formStatusEnum("status").default("draft").notNull(),
  visibility: formVisibilityEnum("visibility").default("public").notNull(),
  themeId: uuid("theme_id"),
  settings: jsonb("settings").$type<{
    password?: string;
    expiry?: string;
    responseLimit?: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
});

export const themesTable = pgTable("themes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  category: themeCategoryEnum("category").notNull(),
  colors: jsonb("colors").$type<{
    primary: string;
    background: string;
    surface: string;
    text: string;
  }>().notNull(),
});

export const fieldsTable = pgTable("fields", {
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
  validationRules: jsonb("validation_rules").$type<{
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
  }>(),
  conditionalLogic: jsonb("conditional_logic").$type<{
    showIf?: {
      fieldId: string;
      operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than";
      value: string | number | boolean;
    };
  }>(),
});

export const fieldOptionsTable = pgTable("field_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  fieldId: uuid("field_id")
    .notNull()
    .references(() => fieldsTable.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 255 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  order: integer("order").notNull(),
});

export const responsesTable = pgTable("responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  formId: uuid("form_id")
    .notNull()
    .references(() => formsTable.id, { onDelete: "cascade" }),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  ipHash: varchar("ip_hash", { length: 64 }),
  completedInSeconds: integer("completed_in_seconds"),
});

export const answersTable = pgTable("answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  responseId: uuid("response_id")
    .notNull()
    .references(() => responsesTable.id, { onDelete: "cascade" }),
  fieldId: uuid("field_id")
    .notNull()
    .references(() => fieldsTable.id, { onDelete: "cascade" }),
  value: jsonb("value").$type<string | number | boolean | string[]>(),
});

export const formViewsTable = pgTable("form_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  formId: uuid("form_id")
    .notNull()
    .references(() => formsTable.id, { onDelete: "cascade" }),
  viewedAt: timestamp("viewed_at").defaultNow().notNull(),
});
