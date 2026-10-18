import { z } from "zod";

/** Shared inputs/outputs for the admin sub-routers. */

export const TAGS = ["Admin"];

export const paginationInput = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const userIdInput = z.object({ id: z.string().uuid() });

export const formIdInput = z.object({ id: z.string().uuid() });

export const adminUserOutput = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean().nullable(),
  createdAt: z.string().nullable(),
  role: z.enum(["admin", "user"]),
  plan: z.enum(["free", "pro", "enterprise"]),
  suspended: z.boolean(),
  /** True when the role comes from ADMIN_EMAILS rather than the users table. */
  roleFromEnv: z.boolean(),
  formCount: z.number(),
});

export const adminFormOutput = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  slug: z.string(),
  status: z.enum(["draft", "published", "unpublished"]),
  visibility: z.enum(["public", "unlisted"]),
  archived: z.boolean(),
  isFeatured: z.boolean(),
  isTemplate: z.boolean(),
  templateCategory: z.string().nullable(),
  customDomain: z.string().nullable(),
  customDomainStatus: z.enum(["pending", "verified", "failed"]),
  ownerId: z.string().uuid(),
  ownerName: z.string(),
  ownerEmail: z.string(),
  responseCount: z.number(),
  viewCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
});

export const adminTemplateOutput = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  slug: z.string(),
  status: z.enum(["draft", "published", "unpublished"]),
  templateCategory: z.string().nullable(),
  isFeatured: z.boolean(),
  fieldCount: z.number(),
  responseCount: z.number(),
  ownerId: z.string().uuid(),
  ownerName: z.string(),
  ownerEmail: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
});

export const paginatedOutput = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
  });

export const idResultOutput = z.object({
  id: z.string().uuid(),
  ok: z.boolean(),
});
