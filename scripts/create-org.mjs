#!/usr/bin/env node
/**
 * Legt eine Organisation mit erstem Standort und erstem Org-Admin an.
 * Bewusst kein Self-Service im Pilot (go-to-market.md §6): der Betreiber
 * richtet jede Organisation selbst ein.
 *
 *   docker compose run --rm migrate node scripts/create-org.mjs \
 *     --name "Muster Hausverwaltung" --slug muster --site "Tiefgarage Nord" \
 *     --admin verwaltung@example.com
 *
 * Das Admin-Konto muss bereits registriert und bestätigt sein. Weitere
 * Standorte legt der Org-Admin unter /o/<slug>/admin selbst an.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import pg from "pg";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    slug: { type: "string" },
    site: { type: "string" },
    admin: { type: "string" },
  },
});

async function main() {
  const { name, slug, site } = values;
  const admin = values.admin?.trim().toLowerCase();
  if (!name || !slug || !site || !admin) {
    throw new Error(
      'Aufruf: node scripts/create-org.mjs --name "<Name>" --slug <slug> --site "<Standort>" --admin <e-mail>',
    );
  }
  const connectionString = process.env.DATABASE_ADMIN_URL;
  if (!connectionString) throw new Error("DATABASE_ADMIN_URL ist nicht gesetzt.");

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query("SELECT id FROM users WHERE lower(email) = $1", [admin]);
    if (user.rowCount === 0) throw new Error(`Kein Konto mit der Adresse ${admin} gefunden.`);

    const org = await client.query(
      "INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id",
      [name, slug],
    );
    // Gleiches Format wie src/lib/tags/token.ts: 128 Bit, base64url.
    const token = randomBytes(16).toString("base64url");
    await client.query("INSERT INTO org_sites (org_id, name, token) VALUES ($1, $2, $3)", [
      org.rows[0].id,
      site,
      token,
    ]);
    await client.query("INSERT INTO org_admins (org_id, user_id) VALUES ($1, $2)", [
      org.rows[0].id,
      user.rows[0].id,
    ]);
    await client.query("COMMIT");

    const base = (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
    console.log(`Organisation angelegt: ${name} (${slug})`);
    console.log(`Org-Admin:              ${admin}`);
    console.log(`Verwaltung:             ${base}/o/${slug}/admin`);
    console.log(`Standort „${site}“:     ${base}/s/${token}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
