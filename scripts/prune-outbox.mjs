#!/usr/bin/env node
/**
 * Entfernt erledigte Einträge aus `notification_outbox`: versendete und
 * aufgegebene (10 Fehlversuche), sobald sie älter als 30 Tage sind. Offene
 * Einträge bleiben. Die Frist nennt die Datenschutzerklärung.
 *
 *   docker compose run --rm migrate node scripts/prune-outbox.mjs
 */
import pg from "pg";

const RETAIN_DAYS = 30;

async function main() {
  const connectionString = process.env.DATABASE_ADMIN_URL;
  if (!connectionString) {
    throw new Error("DATABASE_ADMIN_URL ist nicht gesetzt.");
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const { rowCount } = await client.query(
      `DELETE FROM notification_outbox
        WHERE (sent_at IS NOT NULL OR attempts >= 10)
          AND created_at < now() - make_interval(days => $1)`,
      [RETAIN_DAYS],
    );
    console.log(
      rowCount === 0
        ? "keine erledigten Benachrichtigungen älter als 30 Tage"
        : `${rowCount} erledigte Benachrichtigung(en) entfernt`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
