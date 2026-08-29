import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Beweisfotos kommen jetzt vom eigenen Origin über /api/proofs und werden
  // dort pro Abruf autorisiert. `remotePatterns` für Supabase Storage entfällt.
};

export default nextConfig;
