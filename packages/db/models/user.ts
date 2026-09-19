import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  timestamp,
  boolean,
  text,
} from "drizzle-orm/pg-core";

export const userPlanEnum = pgEnum("user_plan", ["free", "pro", "enterprise"]);

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),

  name: varchar("name", { length: 80 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").default(false),
  image: text("image"),

  plan: userPlanEnum("plan").default("free").notNull(),
  subscriptionId: varchar("subscription_id", { length: 64 }),
  subscriptionStatus: varchar("subscription_status", { length: 32 }),
  planUpdatedAt: timestamp("plan_updated_at"),

  company: varchar("company", { length: 120 }),
  jobTitle: varchar("job_title", { length: 120 }),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
});

export type SelectUser = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
