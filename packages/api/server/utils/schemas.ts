import { z } from "zod";
import { FieldType } from "@repo/validators";

export const themeOutput = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category: z.enum([
    "movies",
    "anime",
    "games",
    "startups",
    "tech",
    "os",
    "events",
    "community",
  ]),
  colors: z.object({
    primary: z.string(),
    background: z.string(),
    surface: z.string(),
    text: z.string(),
  }),
});

export const fieldOptionOutput = z.object({
  id: z.string().uuid(),
  label: z.string(),
  value: z.string(),
  order: z.number().int(),
});

export const fieldOutput = z.object({
  id: z.string().uuid(),
  formId: z.string().uuid(),
  type: FieldType,
  label: z.string(),
  placeholder: z.string().nullable().optional(),
  helpText: z.string().nullable().optional(),
  required: z.boolean(),
  order: z.number().int(),
  validationRules: z.record(z.string(), z.unknown()).nullable().optional(),
  conditionalLogic: z.record(z.string(), z.unknown()).nullable().optional(),
  options: z.array(fieldOptionOutput).optional(),
});

export const formMetaOutput = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable().optional(),
  slug: z.string(),
  status: z.enum(["draft", "published", "unpublished"]),
  visibility: z.enum(["public", "unlisted"]),
  archived: z.boolean(),
  themeId: z.string().uuid().nullable().optional(),
  settings: z
    .object({
      password: z.string().optional(),
      expiry: z.string().nullable().optional(),
      responseLimit: z.number().int().positive().optional(),
      thankYouMessage: z.string().max(2000).optional(),
    })
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string().nullable().optional(),
});

export const formDetailOutput = z.object({
  form: formMetaOutput,
  fields: z.array(fieldOutput),
  theme: themeOutput.nullable(),
});

export const formWithCountsOutput = formMetaOutput.extend({
  responseCount: z.number(),
  viewCount: z.number(),
});

export type FormOutput = z.infer<typeof formMetaOutput>;
export type FieldOutput = z.infer<typeof fieldOutput>;
export type ThemeOutput = z.infer<typeof themeOutput>;