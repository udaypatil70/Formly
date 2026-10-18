import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";

import { env } from "@repo/services/env";

/**
 * Custom-domain ownership verification.
 *
 * A domain is only served once the owner proves control of it by publishing a
 * challenge token in DNS. Two routes to proof are supported because DNS
 * providers differ:
 *
 *   TXT     `_formly.<domain>`  TXT  `formly-verification=<token>`
 *   CNAME   `<domain>`          CNAME `<DOMAIN_VERIFICATION_DNS_TARGET>`
 *
 * The TXT record is preferred because it does not affect where the domain
 * resolves; the CNAME route is offered for providers that make TXT awkward.
 */

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const TXT_PREFIX = "formly-verification";
const CHALLENGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Registrable suffixes we must never let a tenant claim, because a single
 * shared host serves unrelated customers. Claiming one would let an attacker
 * hijack every other tenant on that host.
 */
const RESERVED_SUFFIXES = [
  "vercel.app",
  "netlify.app",
  "pages.dev",
  "github.io",
  "gitlab.io",
  "herokuapp.com",
  "onrender.com",
  "web.app",
  "firebaseapp.com",
  "webflow.io",
  "wixsite.com",
  "squarespace.com",
  "glitch.me",
  "repl.co",
  "fly.dev",
  "localhost",
  "local",
  "test",
  "example",
  "invalid",
  "internal",
];

export class InvalidDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDomainError";
  }
}

/**
 * Canonical form of a user-typed domain: lowercase, no scheme, no path, no
 * `www.`. Throws `InvalidDomainError` when the value cannot be a real domain.
 */
export function normalizeDomainInput(raw: string): string {
  let value = raw.trim().toLowerCase();
  if (!value) throw new InvalidDomainError("Enter a domain");

  value = value.replace(/^[a-z]+:\/\//, "");
  value = value.split("/")[0]!;
  value = value.split("?")[0]!;
  value = value.split("#")[0]!;
  value = value.replace(/:\d+$/, "");
  value = value.replace(/^www\./, "");
  value = value.replace(/\.+$/, "");

  if (!value || value.length > 253) {
    throw new InvalidDomainError("Enter a valid domain");
  }
  // A bare IPv4/IPv6 literal is not something we can verify via DNS records.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value) || value.includes(":")) {
    throw new InvalidDomainError("IP addresses cannot be used as a custom domain");
  }

  const labels = value.split(".");
  if (labels.length < 2) {
    throw new InvalidDomainError("Use a full domain such as forms.example.com");
  }
  for (const label of labels) {
    if (!LABEL.test(label)) {
      throw new InvalidDomainError("Enter a valid domain");
    }
  }

  const suffix = labels.slice(-2).join(".");
  if (RESERVED_SUFFIXES.includes(suffix)) {
    throw new InvalidDomainError(
      "That domain is not available for custom domains",
    );
  }

  return value;
}

export function isReservedDomain(domain: string): boolean {
  const labels = domain.split(".");
  return RESERVED_SUFFIXES.includes(labels.slice(-2).join("."));
}

/** Fresh challenge token. Re-requesting rotates it, invalidating old records. */
export function createChallengeToken(): string {
  return randomBytes(24).toString("hex");
}

export type DomainInstructions = {
  domain: string;
  method: "txt" | "cname";
  /** Hostname to create the record on, e.g. `_formly.forms.example.com`. */
  host: string;
  /** Full record value for TXT, or the CNAME target. */
  value: string;
  ttl: number;
  /** Shown to the user so they know what a correct setup looks like. */
  label: string;
};

/** The exact DNS record the owner must publish for this challenge token. */
export function buildInstructions(
  domain: string,
  token: string,
): DomainInstructions[] {
  const target = env.DOMAIN_VERIFICATION_DNS_TARGET;
  const instructions: DomainInstructions[] = [
    {
      domain,
      method: "txt",
      host: `${env.DOMAIN_VERIFICATION_TXT_PREFIX}.${domain}`,
      value: `${TXT_PREFIX}=${token}`,
      ttl: 3600,
      label: "TXT",
    },
  ];

  if (target) {
    instructions.push({
      domain,
      method: "cname",
      host: domain,
      value: target,
      ttl: 3600,
      label: "CNAME",
    });
  }
  return instructions;
}

export type DnsCheckResult =
  | { verified: true; method: "txt" | "cname" }
  | { verified: false; reason: string };

/**
 * Looks for the challenge token in the domain's DNS records.
 *
 * Resolution failures are reported rather than thrown so the caller can persist
 * them on the challenge row and show the owner why it failed.
 */
export async function checkDnsRecords(
  domain: string,
  token: string,
): Promise<DnsCheckResult> {
  const expected = `${TXT_PREFIX}=${token}`;

  try {
    const records = await withTimeout(
      dns.resolveTxt(`${env.DOMAIN_VERIFICATION_TXT_PREFIX}.${domain}`),
      5000,
    );
    const flattened = records.map((chunks) => chunks.join("")).map((v) => v.trim().toLowerCase());
    if (flattened.includes(expected.toLowerCase())) {
      return { verified: true, method: "txt" };
    }
  } catch {
    // No TXT record (NXDOMAIN / empty answer) — fall through to CNAME.
  }

  const target = env.DOMAIN_VERIFICATION_DNS_TARGET;
  if (target) {
    try {
      const records = await withTimeout(dns.resolveCname(domain), 5000);
      const matched = records.some(
        (record) => record.toLowerCase().replace(/\.$/, "") === target.toLowerCase().replace(/\.$/, ""),
      );
      if (matched) return { verified: true, method: "cname" };
    } catch {
      // No CNAME record either.
    }
  }

  return {
    verified: false,
    reason: target
      ? `No matching TXT or CNAME record found for ${domain}. DNS changes can take up to 24h to propagate.`
      : `No matching TXT record found for ${domain}. DNS changes can take up to 24h to propagate.`,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("dns_timeout")), ms),
    ),
  ]);
}

export function challengeExpiry(): Date {
  return new Date(Date.now() + CHALLENGE_TTL_MS);
}
