import { pool } from "@/lib/db/pool";
import { outboxLagSeconds } from "@/lib/db/queries";
import { logger } from "@/lib/logger";

/**
 * Healthcheck für Monitoring und den `web`-Container. Bewusst der dritte (und
 * letzte) Route Handler: `<img>` und ein Container-Healthcheck brauchen eine
 * URL, kein Server-Action-Aufruf. Mutiert nichts.
 *
 * `status` hängt nur an der Datenbank – ein hängender Notifier soll den
 * `web`-Container nicht neu starten lassen. `outboxLagSeconds` zeigt, wie lange
 * die älteste fällige Benachrichtigung schon wartet; ein Uptime-Monitor kann
 * darauf alarmieren.
 */
export const dynamic = "force-dynamic";

/** Ab diesem Rückstand meldet das Log eine Warnung. */
const OUTBOX_LAG_WARN_SECONDS = 300;

export async function GET(): Promise<Response> {
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    logger.error("Healthcheck: Datenbank nicht erreichbar", err);
    return Response.json(
      { status: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let outboxLag: number | null = null;
  try {
    outboxLag = await outboxLagSeconds();
    if (outboxLag >= OUTBOX_LAG_WARN_SECONDS) {
      logger.warn("Benachrichtigungen stauen sich – läuft der notifier?", {
        outboxLagSeconds: outboxLag,
      });
    }
  } catch (err) {
    logger.error("Healthcheck: Outbox-Rückstand nicht lesbar", err);
  }

  return Response.json(
    { status: "ok", outboxLagSeconds: outboxLag },
    { headers: { "Cache-Control": "no-store" } },
  );
}
