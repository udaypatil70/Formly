import type { RequestHandler } from "express";

/**
 * Baseline security headers applied to every response.
 *
 * Kept dependency-free so the server has no extra supply-chain surface. The
 * CSP is deliberately strict: the API serves JSON plus file downloads, so no
 * scripts, frames or plugins are ever needed.
 */
const API_CSP =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

// The Scalar API reference is a bundled HTML app that needs its own scripts
// and inline styles; it is the only route allowed to relax the policy.
const DOCS_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; font-src 'self' data: https://cdn.jsdelivr.net; connect-src 'self'; frame-ancestors 'none'";

export const securityHeaders: RequestHandler = (req, res, next) => {
  // Do not let a browser guess a different type than the one we declared.
  res.setHeader("X-Content-Type-Options", "nosniff");
  // The API must never be framed (clickjacking).
  res.setHeader("X-Frame-Options", "DENY");
  const isDocs = req.path === "/docs" || req.path.startsWith("/docs/");
  res.setHeader(
    "Content-Security-Policy",
    isDocs ? DOCS_CSP : API_CSP,
  );
  // Referrers can leak form/response paths to third parties.
  res.setHeader("Referrer-Policy", "no-referrer");
  // Only HTTPS resources once the app is served over TLS.
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.removeHeader("X-Powered-By");

  next();
};

/**
 * Rejects state-changing requests whose `Origin` is not on the allow-list.
 *
 * CORS alone is not enough: a browser will happily *send* a simple cross-site
 * POST and only withhold the response. Browsers always attach `Origin` to
 * cross-origin writes, so an allow-listed check turns that into a hard
 * rejection. Requests with no `Origin` (server-to-server callers such as the
 * Razorpay webhook) are left alone.
 */
export function enforceTrustedOrigin(
  allowedOrigins: string[],
): RequestHandler {
  const allowed = new Set(allowedOrigins);
  const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

  return (req, res, next) => {
    if (safeMethods.has(req.method)) return next();

    const origin = req.headers.origin;
    if (!origin || allowed.has(origin)) return next();

    return res.status(403).json({ error: "Origin not allowed" });
  };
}
