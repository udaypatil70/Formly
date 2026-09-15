const DEFAULT_API_URL = "http://localhost:8000/trpc";

function getApiUrl(): string {
  return import.meta.env.VITE_API_URL ?? DEFAULT_API_URL;
}

/** Base origin of the API server (without the /trpc path). */
export function getApiOrigin(): string {
  return new URL(getApiUrl(), window.location.origin).origin;
}

/** Absolute base URL for better-auth endpoints on the API server. */
export function getAuthEndpoints() {
  return {
    origin: getApiOrigin(),
    signIn: `${getApiOrigin()}/auth/sign-in/email`,
    signUp: `${getApiOrigin()}/auth/sign-up/email`,
  };
}