const VISITOR_KEY = "formly:visitor";
const EDIT_TOKEN_PREFIX = "formly:edit:";

/**
 * Browser-scoped anonymous id. It binds saved drafts and response edit links
 * to this browser without fingerprinting the visitor.
 */
export function getVisitorId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return null;
  }
}

export function getStoredEditToken(slug: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(`${EDIT_TOKEN_PREFIX}${slug}`);
  } catch {
    return null;
  }
}

export function storeEditToken(slug: string, token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${EDIT_TOKEN_PREFIX}${slug}`, token);
  } catch {
    // Storage can be unavailable (private mode); the link still works for the
    // current session because the caller keeps it in component state.
  }
}

export function clearEditToken(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${EDIT_TOKEN_PREFIX}${slug}`);
  } catch {
    // ignore
  }
}
