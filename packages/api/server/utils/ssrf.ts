import dns from "node:dns/promises";
import net from "node:net";

/**
 * Guards outbound requests whose URL is chosen by a user (webhooks).
 *
 * Without this an authenticated user could point a webhook at the cloud
 * metadata endpoint, an internal admin panel, or a database port and read the
 * response status back through the "test webhook" call.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

/** True when the address is anything other than a public, routable IP. */
function isPrivateAddress(address: string): boolean {
  const ip = net.isIP(address);
  if (ip === 4) return isPrivateV4(address);
  if (ip === 6) return isPrivateV6(address);
  return true;
}

function isPrivateV4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];

  if (a === 0) return true; // "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateV6(address: string): boolean {
  const bytes = parseIpv6(address.split("%")[0]!);
  // Unparseable input is treated as unsafe rather than allowed.
  if (!bytes) return true;

  const isZeroPrefix = bytes.slice(0, 10).every((b) => b === 0);

  // ::ffff:0:0/96 — IPv4-mapped. The embedded IPv4 decides the verdict.
  // Note WHATWG URL normalises [::ffff:127.0.0.1] to hex form (::ffff:7f00:1),
  // so this must be checked on the raw bytes, not on a dotted-quad string.
  if (isZeroPrefix && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isPrivateV4(
      `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`,
    );
  }

  // :: (unspecified) and ::1 (loopback)
  if (bytes.slice(0, 15).every((b) => b === 0)) return true;

  // fc00::/7 unique-local
  if ((bytes[0]! & 0xfe) === 0xfc) return true;
  // fe80::/10 link-local
  if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80) return true;
  // 2001:db8::/32 documentation (mirrors the reserved IPv4 handling)
  if (
    bytes[0] === 0x20 &&
    bytes[1] === 0x01 &&
    bytes[2] === 0x0d &&
    bytes[3] === 0xb8
  ) {
    return true;
  }
  // ::/96 and other reserved ranges
  if (isZeroPrefix && bytes[10] === 0 && bytes[11] === 0) return true;

  return false;
}

/** Expands any IPv6 textual form into its 16 bytes, or null if malformed. */
function parseIpv6(address: string): number[] | null {
  const [head, tail, extra] = address.split("::");
  if (extra !== undefined) return null;

  const toGroups = (part: string): number[] | null => {
    if (!part) return [];
    const out: number[] = [];
    for (const chunk of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/i.test(chunk)) return null;
      out.push(parseInt(chunk, 16));
    }
    return out;
  };

  const left = toGroups(head ?? "");
  const right = tail === undefined ? [] : toGroups(tail);
  if (!left || !right) return null;

  let groups: number[];
  if (tail === undefined) {
    if (left.length !== 8) return null;
    groups = left;
  } else {
    const fill = 8 - left.length - right.length;
    if (fill < 0) return null;
    groups = [...left, ...Array<number>(fill).fill(0), ...right];
  }

  const bytes: number[] = [];
  for (const group of groups) {
    bytes.push((group >> 8) & 0xff, group & 0xff);
  }
  return bytes.length === 16 ? bytes : null;
}

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

/**
 * Validates a user-supplied outbound URL and returns it. Throws
 * `SsrfBlockedError` when the target is not a public http(s) endpoint.
 *
 * DNS is resolved so a hostname pointing at an internal address (DNS
 * rebinding) is rejected before the request is made.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError("Enter a valid URL");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new SsrfBlockedError("Webhook URLs must use http:// or https://");
  }

  if (url.username || url.password) {
    throw new SsrfBlockedError("Webhook URLs cannot contain credentials");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname) {
    throw new SsrfBlockedError("Webhook URL is missing a hostname");
  }
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
    throw new SsrfBlockedError("Webhook URLs cannot target local addresses");
  }

  // A literal IP is checked directly; anything else is resolved and every
  // returned address is checked.
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new SsrfBlockedError("Webhook URLs cannot target private addresses");
    }
    return url;
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SsrfBlockedError("Webhook hostname could not be resolved");
  }

  if (addresses.length === 0) {
    throw new SsrfBlockedError("Webhook hostname could not be resolved");
  }
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new SsrfBlockedError("Webhook URLs cannot target private addresses");
  }

  return url;
}
