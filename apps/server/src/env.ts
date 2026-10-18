import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().optional(),
  NODE_ENV: z.enum(["development", "prod"]).default("development"),
  BASE_URL: z.string().default("http://localhost:8000"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  UPLOADS_DIR: z
    .string()
    .default("./uploads")
    .describe("Directory for uploaded response files"),
  DOMAIN_VERIFICATION_DNS_TARGET: z
    .string()
    .optional()
    .describe("Hostname custom domains should CNAME to"),
  DOMAIN_VERIFICATION_TXT_PREFIX: z
    .string()
    .default("_formly")
    .describe("Subdomain prefix the TXT challenge is published under"),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_PRO_PLAN_ID: z
    .string()
    .optional()
    .describe("Razorpay plan id used for Pro subscriptions"),
});

function createEnv(env: NodeJS.ProcessEnv) {
  const safeParseResult = envSchema.safeParse(env);
  if (!safeParseResult.success) throw new Error(safeParseResult.error.message);
  return safeParseResult.data;
}

export const env = createEnv(process.env);
