export function normalizePlate(plate: string): string {
  if (!plate || typeof plate !== "string") return "";
  return plate.replace(/[-\s]/g, "").toUpperCase();
}

/**
 * validateGermanPlate
 * - Accepts common German plate formats (with or without hyphens/spaces):
 *   Examples accepted: "KA-AB-1234", "B-MW-123E", "F-AB-1", "S-A-123H"
 * - Supports electric-suffix 'E' and historic-suffix 'H'.
 */
export function validateGermanPlate(plate: string): boolean {
  if (!plate || typeof plate !== "string") return false;

  const normalized = normalizePlate(plate);

  // German plates normalized (no separators) generally follow:
  // - 1-3 letters (city/region code)
  // - 1-2 letters (one or two letters)
  // - 1-4 digits
  // - optional suffix: E (electric) or H (historic)
  // Examples (normalized): KAAB1234, BMW123E, BA1, SA123H
  const re = /^([A-Z]{1,3})([A-Z]{1,2})(\d{1,4})([EH])?$/;
  return re.test(normalized);
}
