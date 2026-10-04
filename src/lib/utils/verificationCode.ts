import { randomInt } from "node:crypto";

// Ohne die leicht verwechselbaren Zeichen 0/O und 1/I – der Code wird von Hand
// auf ein Blatt geschrieben und vom Admin vom Foto abgelesen.
const VERIFICATION_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Erzeugt einen 6-stelligen Verifizierungscode im Format "XX-XXXX", z. B.
 * "PD-8X4A". `crypto.randomInt` statt `Math.random`: der Code ist das einzige
 * Geheimnis der Windschutzscheiben-Prüfung und darf nicht vorhersagbar sein.
 */
export function generateVerificationCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += VERIFICATION_CODE_ALPHABET[randomInt(VERIFICATION_CODE_ALPHABET.length)];
  }
  return `${code.slice(0, 2)}-${code.slice(2)}`;
}
