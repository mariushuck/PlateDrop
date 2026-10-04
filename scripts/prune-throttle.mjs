#!/usr/bin/env node
/**
 * Entfernt alte Zeilen aus `message_throttle`.
 *
 * Der IP-Hash im Rate-Limiter rotiert täglich (src/lib/utils/rateLimit.ts).
 * Zeilen aus vergangenen Tagen zeigen also auf einen Hash, der nie wieder
 * getroffen wird — sie sind toter Ballast. Für das laufende Fenster zählt nur
 * die letzte Minute, ein Sicherheitsabstand von zwei Tagen ist reichlich.
 *
 *   docker compose run --rm migrate node scripts/prune-throttle.mjs
 */
import pg from "pg";

const RETAIN_DAYS = Number.parseInt(process.env.THROTTLE_RETAIN_DAYS ?? "2", 10) || 2;

async function main() {
  const connectionString = process.env.DATABASE_ADMIN_URL;
  if (!connectionString) {
    throw new Error("DATABASE_ADMIN_URL ist nicht gesetzt.");
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const { rowCount } = await client.query(
      `DELETE FROM message_throttle WHERE window_start < now() - ($1 || ' days')::interval`,
      [RETAIN_DAYS],
    );
    console.log(
      rowCount === 0
        ? "keine veralteten Throttle-Zeilen"
        : `${rowCount} veraltete Throttle-Zeile(n) entfernt`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
