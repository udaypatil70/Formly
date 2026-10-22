import { z } from "zod";
import { auditLogsTable, db, desc, eq } from "@repo/db";
import { TRPCError } from "@trpc/server";

import { router, protectedProcedure } from "../../trpc";

const TAGS = ["Audit"];

export const auditRouter = router({
  list: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/audit", tags: TAGS } })
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().nonnegative().default(0),
      }),
    )
    .output(
      z.object({
        events: z.array(
          z.object({
            id: z.string().uuid(),
            actorId: z.string().uuid().nullable(),
            action: z.string(),
            resourceType: z.string(),
            resourceId: z.string().nullable(),
            metadata: z.record(z.string(), z.unknown()),
            ipHash: z.string().nullable(),
            userAgent: z.string().nullable(),
            createdAt: z.string(),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user.plan !== "enterprise") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Audit logs are available on the Enterprise plan",
        });
      }

      const events = await db
        .select()
        .from(auditLogsTable)
        .where(eq(auditLogsTable.ownerId, ctx.user.id))
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(input.limit)
        .offset(input.offset)
        .execute();

      return {
        events: events.map((event) => ({
          id: event.id,
          actorId: event.actorId,
          action: event.action,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          metadata: event.metadata,
          ipHash: event.ipHash,
          userAgent: event.userAgent,
          createdAt: event.createdAt.toISOString(),
        })),
      };
    }),
});
