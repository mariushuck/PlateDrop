import { randomBytes } from "node:crypto";

/** Format eines Standort-Tokens: 128 Bit als base64url, 22 Zeichen (CHECK in 0014). */
export const SITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/**
 * Zufälliges Token für einen Standort-QR. Verrät nichts über Organisation oder
 * Standort; wer den Aushang fotografiert, kann nur schreiben, nicht lesen.
 */
export function generateSiteToken(): string {
  return randomBytes(16).toString("base64url");
}
