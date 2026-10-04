/**
 * Sehr schlanker Logger. In Produktion je Eintrag eine JSON-Zeile (für die
 * Log-Sammlung des Betreibers), sonst menschenlesbar. Kein externer Dienst –
 * Fehler-Aggregation (z. B. Sentry/GlitchTip) lässt sich hier zentral
 * andocken, statt an jeder einzelnen Fehlerstelle.
 */
type Level = "info" | "warn" | "error";

const isProd = process.env.NODE_ENV === "production";

function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;

  if (isProd) {
    sink(JSON.stringify({ level, time: new Date().toISOString(), message, ...meta }));
  } else {
    sink(`[${level}] ${message}`, meta && Object.keys(meta).length ? meta : "");
  }
}

function errorMeta(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { error: err.message, stack: err.stack };
  }
  return err === undefined ? {} : { error: String(err) };
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  /** `err` wird zu `{ error, stack }` aufgelöst. */
  error: (message: string, err?: unknown, meta?: Record<string, unknown>) =>
    emit("error", message, { ...errorMeta(err), ...meta }),
};
