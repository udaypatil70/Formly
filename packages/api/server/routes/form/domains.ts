import { z } from "zod";
import { and, db, eq, ne } from "@repo/db";
import { domainVerificationsTable, formsTable } from "@repo/db/schema";
import { TRPCError } from "@trpc/server";

import { router, protectedProcedure } from "../../trpc";
import {
  InvalidDomainError,
  buildInstructions,
  challengeExpiry,
  checkDnsRecords,
  createChallengeToken,
  normalizeDomainInput,
} from "../../utils/domains";
import { assertFormOwner } from "./shared";

const TAGS = ["Forms"];

const domainInstructionsOutput = z.object({
  domain: z.string(),
  method: z.enum(["txt", "cname"]),
  host: z.string(),
  value: z.string(),
  ttl: z.number().int(),
  label: z.string(),
});

/** Challenge state for a form, shaped for the builder's domain panel. */
const domainVerificationOutput = z.object({
  formId: z.string().uuid(),
  domain: z.string().nullable(),
  status: z.enum(["pending", "verified", "failed"]),
  verifiedAt: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  attempts: z.number().int(),
  expiresAt: z.string().nullable(),
  instructions: z.array(domainInstructionsOutput).nullable(),
});

const idInput = z.object({ id: z.string().uuid() });

const checkDomainInput = z.object({
  domain: z.string().min(1).max(255),
  /** Set when checking a form's own domain so it is not reported as a clash. */
  formId: z.string().uuid().optional(),
});

/** Normalizes user input, converting validation failures into a 400. */
export function parseDomain(raw: string): string {
  try {
    return normalizeDomainInput(raw);
  } catch (error) {
    if (error instanceof InvalidDomainError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    }
    throw error;
  }
}

/**
 * Loads the live challenge for a form plus the DNS records needed to satisfy
 * it. Instructions are only returned while a challenge is pending — once the
 * domain is verified the token is spent and is not shown again.
 */
async function loadVerification(formId: string) {
  const [form] = await db
    .select({
      customDomain: formsTable.customDomain,
      customDomainStatus: formsTable.customDomainStatus,
      customDomainVerifiedAt: formsTable.customDomainVerifiedAt,
    })
    .from(formsTable)
    .where(eq(formsTable.id, formId))
    .limit(1)
    .execute();

  if (!form) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Form not found" });
  }

  const [row] = await db
    .select()
    .from(domainVerificationsTable)
    .where(eq(domainVerificationsTable.formId, formId))
    .limit(1)
    .execute();

  const challenge = row;
  const showInstructions =
    challenge &&
    challenge.status === "pending" &&
    form.customDomainStatus !== "verified";

  return {
    formId,
    domain: form.customDomain ?? challenge?.domain ?? null,
    status: form.customDomain ? form.customDomainStatus : "pending",
    verifiedAt:
      form.customDomainVerifiedAt?.toISOString() ??
      challenge?.verifiedAt?.toISOString() ??
      null,
    lastCheckedAt: challenge?.lastCheckedAt?.toISOString() ?? null,
    lastError: challenge?.lastError ?? null,
    attempts: challenge?.attempts ?? 0,
    expiresAt: challenge?.expiresAt?.toISOString() ?? null,
    instructions: showInstructions
      ? buildInstructions(challenge.domain, challenge.token)
      : null,
  };
}

/** Writes the form's domain status and clears the stale verified timestamp. */
async function setDomainStatus(
  formId: string,
  status: "pending" | "verified" | "failed",
  verifiedAt: Date | null = null,
) {
  await db
    .update(formsTable)
    .set({ customDomainStatus: status, customDomainVerifiedAt: verifiedAt })
    .where(eq(formsTable.id, formId))
    .execute();
}

export const domainProcedures = {
  /**
   * Is this domain free, and is it already live? Owner-only so the builder can
   * report availability (and an existing claim) while the owner is still typing
   * instead of surfacing a unique-constraint error on save.
   */
  checkDomain: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/forms/check-domain/{domain}",
        tags: TAGS,
      },
    })
    .input(checkDomainInput)
    .output(
      z.object({
        domain: z.string(),
        available: z.boolean(),
        verified: z.boolean(),
        reason: z.string().nullable(),
      }),
    )
    .query(async ({ input }) => {
      const domain = parseDomain(input.domain);
      const [existing] = await db
        .select({
          id: formsTable.id,
          status: formsTable.customDomainStatus,
        })
        .from(formsTable)
        .where(
          and(
            eq(formsTable.customDomain, domain),
            // The caller's own form holding the domain is not a conflict.
            input.formId ? ne(formsTable.id, input.formId) : undefined,
          ),
        )
        .limit(1)
        .execute();

      if (!existing) {
        return { domain, available: true, verified: false, reason: null };
      }
      // A verified holder is actually serving traffic on the domain, which is
      // the case worth warning about loudly.
      const live = existing.status === "verified";
      return {
        domain,
        available: false,
        verified: live,
        reason: live
          ? "This domain is already serving another form"
          : "Another form has already claimed this domain",
      };
    }),

  /** Current verification state for a form you own. */
  getDomainVerification: protectedProcedure
    .meta({
      openapi: { method: "GET", path: "/forms/{id}/domain", tags: TAGS },
    })
    .input(idInput)
    .output(domainVerificationOutput)
    .query(async ({ ctx, input }) => {
      await assertFormOwner(input.id, ctx.user.id);
      return loadVerification(input.id);
    }),

  /**
   * Issues a fresh challenge for the form's current custom domain and returns
   * the records to publish. Rotating the token is what makes re-requesting safe:
   * an already-published record stops matching.
   */
  requestDomainVerification: protectedProcedure
    .meta({
      openapi: { method: "POST", path: "/forms/{id}/domain/verify", tags: TAGS },
    })
    .input(idInput)
    .output(domainVerificationOutput)
    .mutation(async ({ ctx, input }) => {
      const form = await assertFormOwner(input.id, ctx.user.id);
      if (!form.customDomain) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Set a custom domain first",
        });
      }

      const token = createChallengeToken();
      await db
        .insert(domainVerificationsTable)
        .values({
          formId: form.id,
          domain: form.customDomain,
          token,
          status: "pending",
          attempts: 0,
          expiresAt: challengeExpiry(),
        })
        .onConflictDoUpdate({
          target: domainVerificationsTable.formId,
          set: {
            token,
            domain: form.customDomain,
            status: "pending",
            attempts: 0,
            lastError: null,
            lastCheckedAt: null,
            verifiedAt: null,
            expiresAt: challengeExpiry(),
          },
        })
        .execute();

      // Re-requesting must not leave a previously verified domain live.
      await setDomainStatus(form.id, "pending");

      return loadVerification(form.id);
    }),

  /**
   * Resolves the domain and looks for the challenge token. Only a match flips
   * the form to `verified`, which is the single value `public.resolveDomain`
   * consults before serving a form on a vhost.
   */
  verifyDomain: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/forms/{id}/domain/confirm",
        tags: TAGS,
      },
    })
    .input(idInput)
    .output(domainVerificationOutput)
    .mutation(async ({ ctx, input }) => {
      const form = await assertFormOwner(input.id, ctx.user.id);
      if (!form.customDomain) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Set a custom domain first",
        });
      }

      const [challenge] = await db
        .select()
        .from(domainVerificationsTable)
        .where(eq(domainVerificationsTable.formId, form.id))
        .limit(1)
        .execute();

      if (!challenge) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Request a verification challenge first",
        });
      }

      if (challenge.expiresAt.getTime() < Date.now()) {
        await db
          .update(domainVerificationsTable)
          .set({ status: "failed", lastError: "Challenge expired" })
          .where(eq(domainVerificationsTable.id, challenge.id))
          .execute();
        await setDomainStatus(form.id, "failed");
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This challenge expired. Request a new one.",
        });
      }

      const result = await checkDnsRecords(challenge.domain, challenge.token);
      const now = new Date();

      if (result.verified) {
        await db
          .update(domainVerificationsTable)
          .set({
            status: "verified",
            attempts: challenge.attempts + 1,
            lastError: null,
            lastCheckedAt: now,
            verifiedAt: now,
          })
          .where(eq(domainVerificationsTable.id, challenge.id))
          .execute();
        await setDomainStatus(form.id, "verified", now);
      } else {
        await db
          .update(domainVerificationsTable)
          .set({
            status: "failed",
            attempts: challenge.attempts + 1,
            lastError: result.reason,
            lastCheckedAt: now,
          })
          .where(eq(domainVerificationsTable.id, challenge.id))
          .execute();
        await setDomainStatus(form.id, "failed");
      }

      return loadVerification(form.id);
    }),

  /** Releases the domain and deletes the challenge. */
  removeDomain: protectedProcedure
    .meta({
      openapi: { method: "POST", path: "/forms/{id}/domain/remove", tags: TAGS },
    })
    .input(idInput)
    .output(domainVerificationOutput)
    .mutation(async ({ ctx, input }) => {
      await assertFormOwner(input.id, ctx.user.id);
      await db
        .delete(domainVerificationsTable)
        .where(eq(domainVerificationsTable.formId, input.id))
        .execute();
      await db
        .update(formsTable)
        .set({
          customDomain: null,
          customDomainStatus: "pending",
          customDomainVerifiedAt: null,
        })
        .where(eq(formsTable.id, input.id))
        .execute();
      return loadVerification(input.id);
    }),
};

export const domainRouter = router(domainProcedures);
