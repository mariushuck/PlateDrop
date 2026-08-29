import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Erzeugt .next/standalone mit einem minimalen server.js – Grundlage für
  // ein schlankes Produktions-Image (siehe Dockerfile).
  output: "standalone",

  // Beweisfotos kommen jetzt vom eigenen Origin über /api/proofs und werden
  // dort pro Abruf autorisiert. `remotePatterns` für Supabase Storage entfällt.
};

export default nextConfig;
