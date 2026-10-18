import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import {
  and,
  count,
  db,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
  type SQL,
} from "@repo/db";
import {
  accountsTable,
  formsTable,
  sessionsTable,
  usersTable,
} from "@repo/db/schema";
import { TRPCError } from "@trpc/server";

import { adminProcedure } from "../../trpc";
import { isAdminEmail, isAdminUser } from "../../utils/admin";
import { assertNotLastAdmin, assertNotSelf, assertNoPublishedForms } from "./guards";
import {
  TAGS,
  adminUserOutput,
  paginationInput,
  userIdInput,
} from "./schemas";

const setRoleInput = userIdInput.extend({
  role: z.enum(["admin", "user"]),
});

const setPlanInput = userIdInput.extend({
  plan: z.enum(["free", "pro", "enterprise"]),
});

const suspendInput = userIdInput.extend({
  suspended: z.boolean(),
});

const resetPasswordInput = userIdInput.extend({
  // Same bounds as `emailAndPassword` in the auth config, so a reset can never
  // write a credential that the sign-in path would reject.
  password: z.string().min(8).max(128),
});

export const adminUserProcedures = {
  /** List all users with their form counts (searchable, paginated). */
  listUsers: adminProcedure
    .meta({ openapi: { method: "GET", path: "/admin/users", tags: TAGS } })
    .input(
      paginationInput.extend({
        search: z.string().max(100).optional(),
        role: z.enum(["admin", "user"]).optional(),
        plan: z.enum(["free", "pro", "enterprise"]).optional(),
        suspended: z.boolean().optional(),
      }),
    )
    .output(
      z.object({
        users: z.array(adminUserOutput),
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
      }),
    )
    .query(async ({ input }) => {
      const { page, pageSize } = input;
      const conditions: SQL[] = [];

      if (input.search) {
        const search = `%${input.search}%`;
        conditions.push(
          or(ilike(usersTable.name, search), ilike(usersTable.email, search))!,
        );
      }
      if (input.suspended !== undefined) {
        conditions.push(
          input.suspended
            ? isNotNull(usersTable.suspendedAt)
            : isNull(usersTable.suspendedAt),
        );
      }

      const where = conditions.length ? and(...conditions) : undefined;
      const rows = await db
        .select({ user: usersTable, formCount: count(formsTable.id) })
        .from(usersTable)
        .leftJoin(formsTable, eq(formsTable.ownerId, usersTable.id))
        .where(where)
        .groupBy(usersTable.id)
        .orderBy(desc(usersTable.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute();

      const [totalRow] = await db
        .select({ total: count() })
        .from(usersTable)
        .where(where)
        .execute();

      // Role/plan/suspended filters are applied in memory because the effective
      // role also depends on ADMIN_EMAILS, which is not a column.
      let users = rows.map((row) => ({
        id: row.user.id,
        name: row.user.name,
        email: row.user.email,
        emailVerified: row.user.emailVerified,
        createdAt: row.user.createdAt?.toISOString() ?? null,
        role: (isAdminUser(row.user) ? "admin" : "user") as "admin" | "user",
        plan: row.user.plan ?? ("free" as const),
        suspended: row.user.suspendedAt !== null,
        roleFromEnv: isAdminEmail(row.user.email),
        formCount: Number(row.formCount),
      }));

      if (input.role) users = users.filter((u) => u.role === input.role);
      if (input.plan) users = users.filter((u) => u.plan === input.plan);

      return {
        users,
        total: Number(totalRow?.total ?? 0),
        page,
        pageSize,
      };
    }),

  /**
   * Grants or revokes admin. Persisted on the row so it survives a redeploy and
   * shows up in the audit trail. Accounts listed in ADMIN_EMAILS stay admin.
   */
  setUserRole: adminProcedure
    .meta({ openapi: { method: "PATCH", path: "/admin/users/{id}/role", tags: TAGS } })
    .input(setRoleInput)
    .output(z.object({ id: z.string().uuid(), role: z.enum(["admin", "user"]) }))
    .mutation(async ({ ctx, input }) => {
      assertNotSelf(ctx.user.id, input.id);
      if (input.role === "user") await assertNotLastAdmin(input.id);

      const updated = await db
        .update(usersTable)
        .set({ role: input.role })
        .where(eq(usersTable.id, input.id))
        .returning({ id: usersTable.id, role: usersTable.role })
        .execute();

      if (!updated[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      return updated[0];
    }),

  /** Manually corrects a user's plan, e.g. for a comped or refunded account. */
  setUserPlan: adminProcedure
    .meta({ openapi: { method: "PATCH", path: "/admin/users/{id}/plan", tags: TAGS } })
    .input(setPlanInput)
    .output(
      z.object({
        id: z.string().uuid(),
        plan: z.enum(["free", "pro", "enterprise"]),
      }),
    )
    .mutation(async ({ input }) => {
      const updated = await db
        .update(usersTable)
        .set({ plan: input.plan, planUpdatedAt: new Date() })
        .where(eq(usersTable.id, input.id))
        .returning({ id: usersTable.id, plan: usersTable.plan })
        .execute();

      if (!updated[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      return updated[0];
    }),

  /** Marks an email as verified without sending a verification mail. */
  verifyUser: adminProcedure
    .meta({
      openapi: { method: "POST", path: "/admin/users/{id}/verify", tags: TAGS },
    })
    .input(userIdInput)
    .output(z.object({ id: z.string().uuid(), emailVerified: z.boolean() }))
    .mutation(async ({ input }) => {
      const updated = await db
        .update(usersTable)
        .set({ emailVerified: true })
        .where(eq(usersTable.id, input.id))
        .returning({
          id: usersTable.id,
          emailVerified: usersTable.emailVerified,
        })
        .execute();

      if (!updated[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      return {
        id: updated[0].id,
        emailVerified: updated[0].emailVerified ?? false,
      };
    }),

  /**
   * Suspends or restores an account. Suspension is recorded, not destructive:
   * the row keeps existing so responses and billing history stay intact.
   */
  setUserSuspended: adminProcedure
    .meta({
      openapi: { method: "POST", path: "/admin/users/{id}/suspend", tags: TAGS },
    })
    .input(suspendInput)
    .output(z.object({ id: z.string().uuid(), suspended: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      assertNotSelf(ctx.user.id, input.id);
      if (input.suspended) {
        await assertNotLastAdmin(input.id);
        await assertNoPublishedForms(input.id);
      }

      const updated = await db
        .update(usersTable)
        .set({ suspendedAt: input.suspended ? new Date() : null })
        .where(eq(usersTable.id, input.id))
        .returning({ id: usersTable.id, suspendedAt: usersTable.suspendedAt })
        .execute();

      if (!updated[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      return {
        id: updated[0].id,
        suspended: updated[0].suspendedAt !== null,
      };
    }),

  /**
   * Sets a new password for an account. Used when a user cannot receive the
   * self-service reset mail.
   *
   * The hash comes from better-auth so the value stays verifiable by the
   * sign-in path, and every existing session is dropped so a stolen cookie
   * cannot outlive the reset.
   */
  resetUserPassword: adminProcedure
    .meta({
      openapi: { method: "POST", path: "/admin/users/{id}/password", tags: TAGS },
    })
    .input(resetPasswordInput)
    .output(z.object({ id: z.string().uuid(), ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      assertNotSelf(ctx.user.id, input.id);

      const updated = await db
        .update(accountsTable)
        .set({ password: await hashPassword(input.password) })
        .where(
          and(
            eq(accountsTable.userId, input.id),
            eq(accountsTable.providerId, "credential"),
          ),
        )
        .returning({ id: accountsTable.id })
        .execute();

      if (!updated[0]) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This account has no password. They sign in with a social provider.",
        });
      }

      await db.delete(sessionsTable).where(eq(sessionsTable.userId, input.id)).execute();

      return { id: input.id, ok: true };
    }),

  /**
   * Deletes an account. Cascades to their forms, fields, responses and themes,
   * so it is refused while they still have published forms.
   */
  deleteUser: adminProcedure
    .meta({
      openapi: { method: "DELETE", path: "/admin/users/{id}", tags: TAGS },
    })
    .input(userIdInput)
    .output(z.object({ id: z.string().uuid(), ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      assertNotSelf(ctx.user.id, input.id);
      await assertNotLastAdmin(input.id);
      await assertNoPublishedForms(input.id);

      const deleted = await db
        .delete(usersTable)
        .where(eq(usersTable.id, input.id))
        .returning({ id: usersTable.id })
        .execute();

      if (!deleted[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      return { id: deleted[0].id, ok: true };
    }),
};

