#!/usr/bin/env node
/**
 * Findet Beweisfotos, auf die keine Zeile in `verified_plates` mehr zeigt.
 *
 * Solche Dateien entstehen, wenn ein Konto gelöscht wird: Die Fremdschlüssel-
 * Kaskade räumt die Datenbankzeilen ab, erreicht das Dateisystem aber nicht.
 * Seltener auch, wenn das Ersetzen eines Fotos die alte Datei nicht entfernen
 * konnte.
 *
 * Verbindet sich als Owner — die App-Rolle sähe wegen RLS nur die Zeilen des
 * jeweiligen Nutzers und hielte deshalb fremde Fotos für verwaist.
 *
 * Standardmäßig wird nur angezeigt. Gelöscht wird ausschließlich mit --delete:
 *
 *   docker compose run --rm migrate node scripts/prune-proofs.mjs
 *   docker compose run --rm migrate node scripts/prune-proofs.mjs --delete
 */
import { readdir, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import pg from "pg";

/** Sammelt alle Dateien als "<verzeichnis>/<datei>" – dem Format von proof_image_url. */
async function collectFiles(root) {
  const found = [];

  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return found;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    for (const file of await readdir(join(root, entry.name), { withFileTypes: true })) {
      if (file.isFile()) found.push(`${entry.name}/${file.name}`);
    }
  }

  return found;
}

async function main() {
  const doDelete = process.argv.includes("--delete");

  const connectionString = process.env.DATABASE_ADMIN_URL;
  if (!connectionString) {
    throw new Error("DATABASE_ADMIN_URL ist nicht gesetzt.");
  }

  const root = resolve(process.env.PROOFS_DIR ?? "/data/proofs");

  const client = new pg.Client({ connectionString });
  await client.connect();

  let referenced;
  try {
    const { rows } = await client.query(
      "SELECT proof_image_url FROM verified_plates WHERE proof_image_url IS NOT NULL",
    );
    referenced = new Set(rows.map((row) => row.proof_image_url));
  } finally {
    await client.end();
  }

  const files = await collectFiles(root);
  const orphans = files.filter((file) => !referenced.has(file));

  if (orphans.length === 0) {
    console.log(`${files.length} Datei(en) geprüft, keine verwaisten Dateien.`);
    return;
  }

  let bytes = 0;
  for (const orphan of orphans) {
    const size = await stat(join(root, orphan))
      .then((s) => s.size)
      .catch(() => 0);
    bytes += size;
    console.log(`  ${orphan}  (${size} Bytes)`);
  }

  if (!doDelete) {
    console.log(
      `${orphans.length} verwaiste Datei(en), ${bytes} Bytes. Zum Entfernen mit --delete erneut aufrufen.`,
    );
    return;
  }

  for (const orphan of orphans) {
    await unlink(join(root, orphan));
  }
  console.log(`${orphans.length} verwaiste Datei(en) entfernt, ${bytes} Bytes freigegeben.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
