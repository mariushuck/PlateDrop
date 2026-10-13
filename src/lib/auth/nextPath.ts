/**
 * Ziel nach der Anmeldung. Erlaubt ist nur die Rückkehr zu einem Standort-
 * Formular (`/s/<token>`), damit `?next=` nie zu einer offenen Weiterleitung
 * wird. Alles andere führt ins Dashboard.
 */
export function safeNextPath(value: unknown): string {
  return typeof value === "string" && /^\/s\/[A-Za-z0-9_-]{22}$/.test(value) ? value : "/dashboard";
}
