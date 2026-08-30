#!/usr/bin/env node
/**
 * Entfernt abgelaufene Sitzungen.
 *
 * better-auth legt in `sessions."ipAddress"` die IP-Adresse der Anmeldung im
 * Klartext ab und räumt abgelaufene Zeilen von sich aus nie weg — sie blieben
 * sonst unbegrenzt liegen. Die IP selbst bleibt bewusst erhalten: Sie ist der
 * Schlüssel, mit dem better-auth Anmeldeversuche bremst. Begrenzt wird also
 * nicht die Erhebung, sondern die Aufbewahrung.
 *
 * Abgelaufene Sitzungen sind ohnehin wertlos: Sie taugen weder zur Anmeldung
 * noch zur Rate-Limit-Auswertung.
 *
 *   docker compose run --rm migrate node scripts/prune-sessions.mjs
 */
import pg from "pg";

async function main() {
  const connectionString = process.env.DATABASE_ADMIN_URL;
  if (!connectionString) {
    throw new Error("DATABASE_ADMIN_URL ist nicht gesetzt.");
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const { rowCount } = await client.query('DELETE FROM sessions WHERE "expiresAt" < now()');

    console.log(
      rowCount === 0
        ? "keine abgelaufenen Sitzungen"
        : `${rowCount} abgelaufene Sitzung(en) entfernt`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
