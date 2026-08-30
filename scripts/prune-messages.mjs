#!/usr/bin/env node
/**
 * Löscht Nachrichten, die älter als `MESSAGE_RETENTION_DAYS` sind.
 *
 * Standardmäßig ist keine Frist gesetzt: Ob und wie lange Nachrichten
 * aufbewahrt werden, ist eine Produktentscheidung. Ist `MESSAGE_RETENTION_DAYS`
 * auf eine positive Zahl gesetzt, entfernt dieser Job ältere Nachrichten —
 * damit die Datenschutzerklärung eine konkrete Speicherfrist nennen kann.
 *
 *   MESSAGE_RETENTION_DAYS=90 docker compose run --rm migrate node scripts/prune-messages.mjs
 */
import pg from "pg";

const retention = Number.parseInt(process.env.MESSAGE_RETENTION_DAYS ?? "", 10);

async function main() {
  if (!Number.isInteger(retention) || retention <= 0) {
    console.log(
      "MESSAGE_RETENTION_DAYS ist nicht gesetzt – Nachrichten werden nicht automatisch gelöscht.",
    );
    return;
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
