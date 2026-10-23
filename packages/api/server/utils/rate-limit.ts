import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { rateLimit, type RateLimitOptions, type RateLimitResult } from "@repo/services/rate-limit";

export { rateLimit, type RateLimitOptions, type RateLimitResult };

export function rateLimitKey(scope: string, identity: string): string {
  const hash = createHash("sha256").update(`formly-rate-limit:${identity}`).digest("hex");
  return `${scope}:${hash}`;
}

export async function enforceRateLimit(
  key: string,
  options: RateLimitOptions,
  message = "Too many requests, please try again later",
): Promise<void> {
  const result = await rateLimit(key, options);
  if (result.limited) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message,
    });
  }
}
