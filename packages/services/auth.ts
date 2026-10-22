import {
  betterAuth,
  type Auth,
  type BetterAuthOptions,
} from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { toNodeHandler } from "better-auth/node";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sso } from "@better-auth/sso";
import { createHash, randomUUID } from "node:crypto";
import { db, eq, or } from "@repo/db";
import {
  usersTable,
  sessionsTable,
  accountsTable,
  verificationsTable,
  ssoProviderTable,
} from "@repo/db/schema";
import { env } from "./env";
import { isEmailConfigured, sendEmailVerificationEmail, sendPasswordResetEmail } from "./email";
import { rateLimit } from "./rate-limit";
import { verifyTurnstileToken } from "./turnstile";

const emailVerificationEnabled = isEmailConfigured();
const forgotPasswordEnabled = emailVerificationEnabled && env.FORGOT_PASSWORD_ENABLED;
const requireEmailVerification = emailVerificationEnabled && env.REQUIRE_EMAIL_VERIFICATION;

/** Public flags the frontend uses to decide which auth UI to show. */
export const authFeatures = {
  emailVerificationEnabled,
  forgotPasswordEnabled,
  requireEmailVerification,
} as const;

function hashKey(value: string): string {
  return createHash("sha256").update(`formly-auth:${value}`).digest("hex");
}

/** Only trust a forwarded IP header when TRUST_PROXY declares one. */
function resolveAuthIp(headers?: Headers): string | undefined {
  const trustProxy = env.TRUST_PROXY?.toLowerCase().trim();
  if (!trustProxy) return undefined;

  const raw = headers?.get(trustProxy);
  return raw?.split(",")[0]?.trim() || undefined;
}

async function enforceAuthRateLimit(action: "signin" | "signup", email: string, ip?: string) {
  const buckets = [
    {
      key: `auth:${action}:email:${hashKey(email)}`,
      limit: action === "signup" ? 5 : 10,
    },
  ];

  if (ip) {
    buckets.push({
      key: `auth:${action}:ip:${hashKey(ip)}`,
      limit: action === "signup" ? 10 : 30,
    });
  }

  for (const bucket of buckets) {
    const result = await rateLimit(bucket.key, {
      limit: bucket.limit,
      windowMs: 15 * 60_000,
    });
    if (result.limited) {
      throw new APIError("TOO_MANY_REQUESTS", {
        message: "Too many attempts. Please try again later.",
      });
    }
  }
}

async function getSsoProviderLimit(user: { id: string }): Promise<number> {
  const [account] = await db
    .select({ plan: usersTable.plan })
    .from(usersTable)
    .where(eq(usersTable.id, user.id))
    .limit(1)
    .execute();
  return account?.plan === "enterprise" ? 1 : 0;
}

const authGuard = createAuthMiddleware(async (ctx) => {
  if (ctx.path === "/sign-in/sso") {
    const email =
      typeof ctx.body?.email === "string"
        ? ctx.body.email.trim().toLowerCase()
        : "";
    const emailDomain =
      email.includes("@") ? email.slice(email.lastIndexOf("@") + 1) : "";
    const requestedDomain =
      typeof ctx.body?.domain === "string"
        ? ctx.body.domain.trim().toLowerCase()
        : "";
    const providerId =
      typeof ctx.body?.providerId === "string" ? ctx.body.providerId : "";
    const conditions = [
      ...(emailDomain ? [eq(ssoProviderTable.domain, emailDomain)] : []),
      ...(requestedDomain
        ? [eq(ssoProviderTable.domain, requestedDomain)]
        : []),
      ...(providerId ? [eq(ssoProviderTable.providerId, providerId)] : []),
    ];
    if (conditions.length === 0) return;

    const providers = await db
      .select({ plan: usersTable.plan, domainVerified: ssoProviderTable.domainVerified })
      .from(ssoProviderTable)
      .innerJoin(usersTable, eq(usersTable.id, ssoProviderTable.userId))
      .where(or(...conditions))
      .execute();
    if (
      providers.some(
        (provider) =>
          provider.plan !== "enterprise" || !provider.domainVerified,
      )
    ) {
      throw new APIError("FORBIDDEN", {
        message: "SAML sign-in is unavailable for this provider",
      });
    }
    return;
  }

  if (ctx.path !== "/sign-in/email" && ctx.path !== "/sign-up/email") {
    return;
  }

  const action = ctx.path === "/sign-up/email" ? "signup" : "signin";
  const email = typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : "";
  const ip = resolveAuthIp(ctx.headers ?? undefined);

  if (email) {
    await enforceAuthRateLimit(action, email, ip);
  }

  const turnstileOk = await verifyTurnstileToken(
    ctx.headers?.get("x-turnstile-token") ?? undefined,
    ip,
  );
  if (!turnstileOk) {
    throw new APIError("BAD_REQUEST", {
      message: "Bot verification failed. Please retry.",
    });
  }
});

const authConfig = {
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: usersTable,
      session: sessionsTable,
      account: accountsTable,
      verification: verificationsTable,
      ssoProvider: ssoProviderTable,
    },
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/auth",
  // FRONTEND_URL may hold a comma-separated list of allowed origins
  // (e.g. "https://app.vercel.app,https://app-git-main.vercel.app").
  trustedOrigins: env.FRONTEND_URL.split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  emailAndPassword: {
    enabled: true,
    // Bound the password length so a huge value cannot be used to stall
    // password hashing, and set an explicit floor for new accounts.
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // Enforcing verification is opt-in: existing deployments may have
    // unverified accounts, and local development often has no SMTP.
    requireEmailVerification,
    revokeSessionsOnPasswordReset: true,
    ...(forgotPasswordEnabled
      ? {
          sendResetPassword: async ({
            user,
            url,
          }: {
            user: { email: string; name: string };
            url: string;
          }) => {
            await sendPasswordResetEmail({
              to: user.email,
              name: user.name,
              resetUrl: url,
            });
          },
          resetPasswordTokenExpiresIn: 60 * 60,
        }
      : {}),
  },
  ...(emailVerificationEnabled
    ? {
        emailVerification: {
          sendVerificationEmail: async ({
            user,
            url,
          }: {
            user: { email: string; name: string };
            url: string;
          }) => {
            await sendEmailVerificationEmail({
              to: user.email,
              name: user.name,
              verificationUrl: url,
            });
          },
          sendOnSignUp: true,
          sendOnSignIn: requireEmailVerification,
          autoSignInAfterVerification: true,
          expiresIn: 60 * 60,
        },
      }
    : {}),
  hooks: {
    before: authGuard,
  },
  plugins: [
    sso({
      domainVerification: { enabled: true },
      disableImplicitSignUp: true,
      organizationProvisioning: { disabled: true },
      providersLimit: getSsoProviderLimit,
      saml: {
        requireTimestamps: true,
        algorithms: { onDeprecated: "reject" },
      },
    }),
  ],
  user: {
    deleteUser: {
      enabled: true,
    },
    additionalFields: {
      plan: {
        type: "string",
        defaultValue: "free",
        input: false,
      },
      role: {
        type: "string",
        defaultValue: "user",
        input: false,
      },
      subscriptionId: {
        type: "string",
        required: false,
        input: false,
      },
      subscriptionStatus: {
        type: "string",
        required: false,
        input: false,
      },
      company: {
        type: "string",
        required: false,
        input: false,
      },
      jobTitle: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      enabled: !!(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET),
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  advanced: {
    // Secure cookies follow the public origin: forced on for https deployments,
    // off for plain-http localhost so local development still works.
    useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
    database: {
      // use real uuid v4 ids so they fit our `uuid` columns cleanly
      generateId: () => randomUUID(),
    },
  },
} satisfies BetterAuthOptions;

export const auth: Auth<typeof authConfig> = betterAuth(authConfig);

export const authHandler = toNodeHandler(auth);

export type Session = typeof auth.$Infer.Session;
