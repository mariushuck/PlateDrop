#!/usr/bin/env node
/**
 * Vergibt oder entzieht Admin-Rechte.
 *
 * Admin-Rechte sind über die Anwendung bewusst nicht änderbar — das Feld ist in
 * better-auth als `input: false` deklariert und keine Server Action fasst es an.
 * Der einzige Weg führt über dieses Skript mit Owner-Zugang zur Datenbank:
 *
 *   docker compose run --rm migrate node scripts/set-admin.mjs halter@example.com
 *   docker compose run --rm migrate node scripts/set-admin.mjs halter@example.com --revoke
 */
import pg from "pg";

async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const email = args
    .find((arg) => !arg.startsWith("--"))
    ?.trim()
    .toLowerCase();

  if (!email) {
    throw new Error(
      "Bitte eine E-Mail-Adresse angeben: node scripts/set-admin.mjs <e-mail> [--revoke]",
    );
  }

  const connectionString = process.env.DATABASE_ADMIN_URL;
  if (!connectionString) {
    throw new Error("DATABASE_ADMIN_URL ist nicht gesetzt.");
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const { rowCount } = await client.query(
      "UPDATE users SET is_admin = $1 WHERE lower(email) = $2",
      [!revoke, email],
    );

    if (rowCount === 0) {
      throw new Error(`Kein Konto mit der Adresse ${email} gefunden.`);
    }

    console.log(revoke ? `Admin-Rechte entzogen: ${email}` : `Admin-Rechte vergeben: ${email}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
