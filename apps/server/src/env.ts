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
  UPLOAD_SIGNING_SECRET: z
    .string()
    .optional()
    .describe("Signs upload download URLs; falls back to BETTER_AUTH_SECRET"),
  UPLOAD_SWEEP_GRACE_HOURS: z.coerce
    .number()
    .int()
    .positive()
    .default(24)
    .describe("Hours an unclaimed upload is kept before it is swept"),
  UPLOAD_SWEEP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(3_600_000)
    .describe("How often to sweep; 0 disables the sweeper"),
  DOMAIN_VERIFICATION_DNS_TARGET: z
    .string()
    .optional()
    .describe("Hostname custom domains should CNAME to"),
  WEBHOOK_WORKER_INTERVAL_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(15_000)
    .describe("How often to retry failed webhook deliveries; 0 disables the worker"),
  WEBHOOK_RETRY_BASE_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15_000)
    .describe("First webhook retry delay; doubles per attempt"),
  WEBHOOK_RETRY_MAX_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(3_600_000)
    .describe("Ceiling for the exponential webhook retry backoff"),
  WEBHOOK_MAX_ATTEMPTS: z.coerce
    .number()
    .int()
    .positive()
    .default(5)
    .describe("Attempts before a webhook delivery is dead-lettered"),
  WEBHOOK_AUTO_DISABLE_FAILURES: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(25)
    .describe("Consecutive failures before a webhook is switched off; 0 never"),
  WEBHOOK_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(30)
    .describe("How long settled webhook deliveries are kept"),
  DATA_RETENTION_INTERVAL_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(86_400_000)
    .describe("How often expired form drafts and old audit records are purged; 0 disables the worker"),
  AUDIT_LOG_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(90)
    .describe("How long enterprise audit records are retained"),
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
