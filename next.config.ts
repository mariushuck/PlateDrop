import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// App-weite Content-Security-Policy. Bewusst ohne Nonce: die App rendert
// überwiegend statisch und hat keine Proxy-/Middleware-Schicht, in der pro
// Request ein Nonce entstehen könnte. `'unsafe-inline'` bleibt deshalb für
// Skripte und Styles nötig (Next-Hydration, next/font-Style-Tag) — externe
// Quellen sind trotzdem komplett gesperrt. Alle Requests der App gehen an den
// eigenen Origin. In der Entwicklung zusätzlich `'unsafe-eval'` (React-Debug)
// und WebSocket-Quellen (HMR).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // HSTS nur in Produktion: hinter dem TLS-Proxy sinnvoll, auf http://localhost
  // im Dev nur störend.
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
];

const nextConfig: NextConfig = {
  // Erzeugt .next/standalone mit einem minimalen server.js – Grundlage für
  // ein schlankes Produktions-Image (siehe Dockerfile).
  output: "standalone",

  // Kein `X-Powered-By: Next.js` – gibt nur die Framework-Version preis.
  poweredByHeader: false,

  // Beweisfotos kommen jetzt vom eigenen Origin über /api/proofs und werden
  // dort pro Abruf autorisiert. `remotePatterns` für Supabase Storage entfällt.

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
