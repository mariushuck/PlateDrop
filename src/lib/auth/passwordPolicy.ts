/**
 * Mindestlänge für Passwörter – an genau einer Stelle, damit better-auth
 * (src/lib/auth/server.ts), die Server Actions und die Formular-Hinweise nicht
 * auseinanderlaufen. Rein datenseitig, daher auch aus Client Components
 * importierbar.
 */
export const MIN_PASSWORD_LENGTH = 12;
