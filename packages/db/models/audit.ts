import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { usersTable } from "./user";

export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 120 }).notNull(),
    resourceType: varchar("resource_type", { length: 80 }).notNull(),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    ipHash: varchar("ip_hash", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_owner_created_idx").on(table.ownerId, table.createdAt),
    index("audit_logs_created_idx").on(table.createdAt),
  ],
);

export type SelectAuditLog = typeof auditLogsTable.$inferSelect;
