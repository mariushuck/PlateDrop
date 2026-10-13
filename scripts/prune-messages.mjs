#!/usr/bin/env node
/**
 * Löscht Nachrichten, die älter als `MESSAGE_RETENTION_DAYS` sind.
 *
 * Die Frist ist Pflicht (seit Migration 0012): Die Datenschutzerklärung nennt
 * sie als Speicherdauer, und ausgeblendete oder gemeldete Nachrichten sollen
 * nicht unbegrenzt liegen bleiben. Fehlt sie, bricht der Job mit Fehler ab,
 * statt still nichts zu tun.
 *
 *   MESSAGE_RETENTION_DAYS=90 docker compose run --rm migrate node scripts/prune-messages.mjs
 */
import pg from "pg";

const retention = Number.parseInt(process.env.MESSAGE_RETENTION_DAYS ?? "", 10);

async function main() {
  if (!Number.isInteger(retention) || retention <= 0) {
    throw new Error("MESSAGE_RETENTION_DAYS muss eine positive Zahl von Tagen sein.");
  }

  const connectionString = process.env.DATABASE_ADMIN_URL;
  if (!connectionString) {
    throw new Error("DATABASE_ADMIN_URL ist nicht gesetzt.");
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const { rowCount } = await client.query(
      `DELETE FROM messages WHERE created_at < now() - ($1 || ' days')::interval`,
      [retention],
    );
    console.log(
      rowCount === 0
        ? `keine Nachricht älter als ${retention} Tage`
        : `${rowCount} Nachricht(en) älter als ${retention} Tage entfernt`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
