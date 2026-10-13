#!/usr/bin/env node
/**
 * Vertragsende: exportiert alle Daten einer Organisation und löscht sie
 * (Art. 28 Abs. 3 lit. g DSGVO – Rückgabe und Löschung nach Ende der
 * Auftragsverarbeitung).
 *
 *   docker compose run --rm migrate node scripts/delete-org.mjs --slug muster
 *   docker compose run --rm -T migrate node scripts/delete-org.mjs --slug muster \
 *     --export - --yes > muster-export.json
 *
 * `--export -` schreibt das JSON auf stdout (der Container ist danach weg),
 * alle Meldungen gehen auf stderr.
 * Ohne --yes zeigt es nur, was gelöscht würde. Gelöscht werden Organisation,
 * Standorte, Mitgliedschaften, Org-Admin-Rollen, Fuhrparkliste, Kennzeichen der
 * Organisation und alle Nachrichten über ihre Standorte (per Kaskade). Die
 * Nutzerkonten und ihre öffentlichen Kennzeichen bleiben – sie gehören den
 * Personen, nicht dem Kunden.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import pg from "pg";

const { values } = parseArgs({
  options: {
    slug: { type: "string" },
    export: { type: "string" },
    yes: { type: "boolean", default: false },
  },
});

async function main() {
  if (!values.slug) {
    throw new Error("Aufruf: node scripts/delete-org.mjs --slug <slug> [--export <datei>] [--yes]");
  }
  const connectionString = process.env.DATABASE_ADMIN_URL;
  if (!connectionString) throw new Error("DATABASE_ADMIN_URL ist nicht gesetzt.");

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    const org = await client.query(
      "SELECT id, name, slug, show_sender, allow_free_text, created_at FROM organizations WHERE slug = $1 FOR UPDATE",
      [values.slug],
    );
    if (org.rowCount === 0) throw new Error(`Keine Organisation mit dem Slug ${values.slug}.`);
    const orgId = org.rows[0].id;

    const data = {
      exportiert_am: new Date().toISOString(),
      organization: org.rows[0],
      sites: (
        await client.query(
          "SELECT name, created_at, disabled_at FROM org_sites WHERE org_id = $1 ORDER BY created_at",
          [orgId],
        )
      ).rows,
      admins: (
        await client.query(
          `SELECT u.email FROM org_admins a JOIN users u ON u.id = a.user_id
          WHERE a.org_id = $1 ORDER BY u.email`,
          [orgId],
        )
      ).rows.map((r) => r.email),
      members: (
        await client.query(
          `SELECT u.email, s.name AS site, sm.status, sm.created_at
           FROM site_members sm JOIN org_sites s ON s.id = sm.site_id JOIN users u ON u.id = sm.user_id
          WHERE s.org_id = $1 ORDER BY s.name, u.email`,
          [orgId],
        )
      ).rows,
      plates: (
        await client.query(
          `SELECT vp.plate_number, vp.verification_status, vp.created_at, u.email
           FROM verified_plates vp JOIN users u ON u.id = vp.user_id
          WHERE vp.org_id = $1 ORDER BY vp.plate_number`,
          [orgId],
        )
      ).rows,
      allowlist: (
        await client.query(
          "SELECT plate_number FROM org_plate_allowlist WHERE org_id = $1 ORDER BY 1",
          [orgId],
        )
      ).rows.map((r) => r.plate_number),
      messages: (
        await client.query(
          `SELECT m.plate_number, m.message_type, m.message_text, m.created_at, s.name AS site
           FROM messages m JOIN org_sites s ON s.id = m.site_id
          WHERE m.org_id = $1 ORDER BY m.created_at`,
          [orgId],
        )
      ).rows,
    };

    const summary = `${data.sites.length} Standort(e), ${data.members.length} Mitgliedschaft(en), ${data.plates.length} Kennzeichen, ${data.messages.length} Nachricht(en)`;

    const json = JSON.stringify(data, null, 2);
    if (values.export === "-") process.stdout.write(`${json}\n`);
    else if (values.export) writeFileSync(values.export, json);

    if (!values.yes) {
      await client.query("ROLLBACK");
      console.error(`Würde löschen: ${data.organization.name} – ${summary}.`);
      console.error("Zum Löschen erneut mit --yes aufrufen (am besten mit --export <datei>).");
      return;
    }

    await client.query("DELETE FROM organizations WHERE id = $1", [orgId]);
    await client.query("COMMIT");
    console.error(`Gelöscht: ${data.organization.name} – ${summary}.`);
    if (values.export) console.error(`Export: ${values.export}`);
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
