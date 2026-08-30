import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { requireEnv } from "@/lib/env";

/**
 * Anzahl vertrauenswürdiger Proxy-Hops vor der App (Standard: 1 – der
 * Caddy-Reverse-Proxy aus docker-compose). Jeder Hop hängt eine IP hinten an
 * `X-Forwarded-For` an; die echte Client-IP steht deshalb an Position
 * `länge - hops`, NICHT am Anfang – dort kann ein Client beliebig fälschen.
 * `TRUSTED_PROXY_HOPS=0` schaltet das Vertrauen in `X-Forwarded-For` ab.
 */
function trustedProxyHops(): number {
  const raw = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10);
  return Number.isNaN(raw) || raw < 0 ? 1 : raw;
}

/**
 * Ermittelt die Client-IP aus den Request-Headern – nur so weit, wie den
 * eigenen Proxys zu trauen ist. Gibt `null` zurück, wenn keine belastbare IP
 * bestimmbar ist (dann greift nur der Deckel je Kennzeichen).
 */
export async function getClientIp(): Promise<string | null> {
  const hops = trustedProxyHops();
  if (hops === 0) return null;

  const headersList = await headers();
  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    // parts = [ ...vom Client gesetzt/gefälscht..., <von Proxy 1>, ... <von Proxy N> ]
    const index = parts.length - hops;
    if (index >= 0 && parts[index]) return parts[index];
  }

  // Fallback: ein einzelner, vom Proxy gesetzter Wert.
  return headersList.get("x-real-ip")?.trim() || null;
}

/**
 * Pseudonymize a client IP into a salted, daily-rotating SHA-256 hash.
 * The raw IP is never stored; the daily salt rotation limits how long a hash
 * can be correlated. Returns `null` when no IP is available.
 *
 * `RATE_LIMIT_SALT` ist Pflicht: ohne echtes Salt wäre der Hash über den
 * IPv4-Raum rückrechenbar und die IP faktisch im Klartext gespeichert.
 */
export async function getClientIpHash(): Promise<string | null> {
  const ip = await getClientIp();
  if (!ip) return null;

  const salt = requireEnv("RATE_LIMIT_SALT");
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return createHash("sha256").update(`${ip}:${salt}:${day}`).digest("hex");
}
