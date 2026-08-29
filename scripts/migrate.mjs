#!/usr/bin/env node
/**
 * Migrations-Runner für PlateDrop.
 *
 * Verbindet sich als Owner (DATABASE_ADMIN_URL), stellt die App-Rolle
 * `platedrop_app` sicher und spielt anschließend alle noch nicht angewandten
 * Dateien aus db/migrations/ in alphabetischer Reihenfolge ein. Jede Datei
 * läuft in einer eigenen Transaktion; schlägt sie fehl, wird sie zurückgerollt
 * und der Prozess bricht mit Exit-Code 1 ab.
 *
 * Aufruf: `pnpm db:migrate` bzw. als One-shot-Service `migrate` in Compose.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const APP_ROLE = "platedrop_app";
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

/**
 * Legt die App-Rolle an bzw. gleicht ihr Passwort ab. Bewusst ohne SUPERUSER
 * und ohne BYPASSRLS – nur so greifen die RLS-Policies gegenüber der App.
 */
async function ensureAppRole(client, password) {
  await client.query("SELECT set_config('platedrop.app_password', $1, false)", [password]);
  await client.query(`
    DO $do$
    DECLARE
      pw text := current_setting('platedrop.app_password');
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
        EXECUTE format('ALTER ROLE ${APP_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L', pw);
      ELSE
        EXECUTE format('CREATE ROLE ${APP_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L', pw);
      END IF;
    END
    $do$;
  `);
  await client.query(
    `GRANT CONNECT ON DATABASE ${client.escapeIdentifier(client.database)} TO ${APP_ROLE}`,
  );
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrations(client) {
  const { rows } = await client.query("SELECT name FROM schema_migrations");
  return new Set(rows.map((row) => row.name));
}

async function applyMigration(client, name, sql) {
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error(`Migration ${name} fehlgeschlagen: ${error.message}`, { cause: error });
  }
}

async function main() {
  const connectionString = process.env.DATABASE_ADMIN_URL;
  if (!connectionString) {
    throw new Error("DATABASE_ADMIN_URL ist nicht gesetzt.");
  }

  const appPassword = process.env.APP_DB_PASSWORD;
  if (!appPassword) {
    throw new Error("APP_DB_PASSWORD ist nicht gesetzt.");
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    await ensureAppRole(client, appPassword);
    await ensureMigrationsTable(client);

    const done = await appliedMigrations(client);
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

    let count = 0;
    for (const name of files) {
      if (done.has(name)) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, name), "utf8");
      await applyMigration(client, name, sql);
      console.log(`angewandt: ${name}`);
      count += 1;
    }

    console.log(count === 0 ? "keine offenen Migrationen" : `${count} Migration(en) angewandt`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
