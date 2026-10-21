import { z } from "zod";

/**
 * FRONTEND_URL may hold a comma-separated list of allowed origins
 * (e.g. "https://app.vercel.app,https://app-git-main.vercel.app"), so it is
 * validated per entry rather than as a single URL.
 */
const originList = z
  .string()
  .default("http://localhost:3000")
  .refine(
    (value) => {
      const entries = parseOrigins(value);
      return entries.length > 0 && entries.every((entry) => isHttpUrl(entry));
    },
    {
      message: "FRONTEND_URL must be a comma-separated list of http(s) origins",
    },
  );

function parseOrigins(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Env flags are strings; avoid `z.coerce.boolean()`, where "false" is truthy. */
const booleanFlag = (defaultValue: boolean) =>
  z
    .enum(["true", "false"])
    .default(defaultValue ? "true" : "false")
    .transform((value) => value === "true");

/** Placeholders that must never reach production. */
const WEAK_SECRETS = new Set([
  "your-secret-here-change-in-production",
  "changeme",
  "secret",
  "please-change-me",
]);

const authSecret = z
  .string()
  .min(32, "BETTER_AUTH_SECRET must be at least 32 characters")
  .refine((value) => !WEAK_SECRETS.has(value.trim().toLowerCase()), {
    message: "BETTER_AUTH_SECRET is still the example placeholder — generate a real one",
  });

const envSchema = z.object({
  BETTER_AUTH_SECRET: authSecret,
  BETTER_AUTH_URL: z.string().url().default("http://localhost:8000"),
  FRONTEND_URL: originList,
  ADMIN_EMAILS: z
    .string()
    .optional()
    .describe("Comma-separated emails that get admin panel access"),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  /** Show and enable the forgot-password flow when SMTP is configured. */
  FORGOT_PASSWORD_ENABLED: booleanFlag(true),
  /** Block sign-in until the user clicks the emailed verification link. */
  REQUIRE_EMAIL_VERIFICATION: booleanFlag(false),
  NODE_ENV: z.enum(["development", "prod"]).default("development"),
  /**
   * Set to the proxy header carrying the real client IP (e.g.
   * "x-forwarded-for") when running behind a load balancer. Left unset, the
   * forwarded header is ignored so it cannot be spoofed to dodge rate limits.
   */
  TRUST_PROXY: z.string().optional(),
  /**
   * Hostname owners should CNAME their custom domain to. Optional: when unset
   * only the TXT challenge route is offered.
   */
  DOMAIN_VERIFICATION_DNS_TARGET: z.string().optional(),
  /** Subdomain prefix the TXT challenge is published under. */
  DOMAIN_VERIFICATION_TXT_PREFIX: z.string().default("_formly"),
  /**
   * Key used to sign upload download URLs. Optional: when unset the auth secret
   * is used, so deployments only need this if they sign uploads separately.
   */
  UPLOAD_SIGNING_SECRET: z.string().optional(),
});

function createEnv(env: NodeJS.ProcessEnv) {
  const safeParseResult = envSchema.safeParse(env);
  if (!safeParseResult.success) {
    const details = safeParseResult.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration - ${details}`);
  }
  return safeParseResult.data;
}

export const env = createEnv(process.env);

export { parseOrigins };
