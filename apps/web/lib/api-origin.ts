const DEFAULT_API_URL = "http://localhost:8000/trpc";

/** Base origin of the API server (without the /trpc path). */
export function getApiOrigin(): string {
  if (typeof window === "undefined") {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL).origin;
  }
  return new URL(
    process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL,
    window.location.origin,
  ).origin;
}

/** Absolute base URL for better-auth endpoints on the API server. */
export function getAuthEndpoints() {
  return {
    origin: getApiOrigin(),
    signIn: `${getApiOrigin()}/auth/sign-in/email`,
    signUp: `${getApiOrigin()}/auth/sign-up/email`,
  };
}