import { z } from "zod";
import { FieldType } from "@repo/validators";

const themeCategories = [
  "movies",
  "anime",
  "games",
  "startups",
  "tech",
  "os",
  "events",
  "community",
] as const;

export const themeBackgroundOutput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("solid"), color: z.string() }),
  z.object({ type: z.literal("gradient"), from: z.string(), to: z.string() }),
  z.object({ type: z.literal("image"), url: z.string() }),
]);

export const themeOutput = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid().nullable().optional(),
  name: z.string(),
  category: z.enum(themeCategories),
  font: z.string().nullable().optional(),
  colors: z.object({
    primary: z.string(),
    background: z.string(),
    surface: z.string(),
    text: z.string(),
  }),
  background: themeBackgroundOutput.nullable().optional(),
});

export const themeColorInput = z.object({
  primary: z.string().min(1).max(50),
  background: z.string().min(1).max(50),
  surface: z.string().min(1).max(50),
  text: z.string().min(1).max(50),
});

export const themeBackgroundInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("solid"), color: z.string().min(1).max(50) }),
  z.object({ type: z.literal("gradient"), from: z.string().min(1).max(50), to: z.string().min(1).max(50) }),
  z.object({ type: z.literal("image"), url: z.string().min(1).max(500) }),
]);

export const themeCreateInput = z.object({
  name: z.string().min(1).max(100),
  category: z.enum(themeCategories).optional(),
  font: z.string().max(100).optional(),
  colors: themeColorInput,
  background: themeBackgroundInput.optional(),
});

export const themeUpdateInput = themeCreateInput.partial().extend({
  id: z.string().uuid(),
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
      stepMode: z.enum(["page", "question"]).optional(),
      notifyOnResponse: z.boolean().optional(),
      notificationEmail: z.string().optional(),
      sendConfirmation: z.boolean().optional(),
      confirmationEmailFieldId: z.string().uuid().optional(),
      startScreen: z
        .object({
          enabled: z.boolean(),
          title: z.string().optional(),
          description: z.string().optional(),
          buttonLabel: z.string().optional(),
        })
        .optional(),
      endScreen: z
        .object({
          enabled: z.boolean(),
          title: z.string().optional(),
          message: z.string().optional(),
          buttonLabel: z.string().optional(),
        })
        .optional(),
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