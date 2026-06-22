import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * Extract the client IP from the incoming request headers.
 * Behind a proxy/CDN the real client is the first entry of `x-forwarded-for`.
 * Returns `null` when no IP can be determined.
 */
export async function getClientIp(): Promise<string | null> {
  const headersList = await headers();
  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return headersList.get("x-real-ip")?.trim() || null;
}

/**
 * Pseudonymize a client IP into a salted, daily-rotating SHA-256 hash.
 * The raw IP is never stored; the daily salt rotation limits how long a hash
 * can be correlated. Returns `null` when no IP is available.
 */
export async function getClientIpHash(): Promise<string | null> {
  const ip = await getClientIp();
  if (!ip) return null;

  const salt = process.env.RATE_LIMIT_SALT ?? "";
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return createHash("sha256").update(`${ip}:${salt}:${day}`).digest("hex");
}
