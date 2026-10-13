#!/usr/bin/env node
/**
 * Lässt offene Claims ohne Beweisfoto nach 7 Tagen verfallen (Status `expired`).
 *
 * Ein Claim ohne Foto ist nie prüfbar. Er zählt aber gegen das Limit offener
 * Claims des Nutzers und taucht als Konkurrenz auf, wenn der echte Halter das
 * Kennzeichen beansprucht. Die Zeile bleibt stehen, damit der Nutzer im
 * Dashboard sieht, was passiert ist; er kann das Kennzeichen erneut beanspruchen.
 *
 *   docker compose run --rm migrate node scripts/prune-claims.mjs
 */
import pg from "pg";

const MAX_AGE_DAYS = 7;

async function main() {
  const connectionString = process.env.DATABASE_ADMIN_URL;
  if (!connectionString) {
    throw new Error("DATABASE_ADMIN_URL ist nicht gesetzt.");
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const { rowCount } = await client.query(
      `UPDATE verified_plates SET verification_status = 'expired'
        WHERE verification_status = 'pending'
          AND proof_image_url IS NULL
          AND created_at < now() - make_interval(days => $1)`,
      [MAX_AGE_DAYS],
    );
    console.log(
      rowCount === 0
        ? "keine verfallenen Claims"
        : `${rowCount} Claim(s) ohne Foto auf expired gesetzt`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
