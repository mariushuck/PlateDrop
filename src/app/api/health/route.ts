import { pool } from "@/lib/db/pool";
import { logger } from "@/lib/logger";

/**
 * Healthcheck für Monitoring und den `web`-Container. Bewusst der dritte (und
 * letzte) Route Handler: `<img>` und ein Container-Healthcheck brauchen eine
 * URL, kein Server-Action-Aufruf. Mutiert nichts, prüft nur, dass die
 * Datenbank erreichbar ist.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await pool.query("SELECT 1");
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error("Healthcheck: Datenbank nicht erreichbar", err);
    return Response.json(
      { status: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
