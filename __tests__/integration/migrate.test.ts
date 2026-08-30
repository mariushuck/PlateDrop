import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";
import { ADMIN_URL, APP_PASSWORD, withAdmin } from "./helpers/db";

const execFileAsync = promisify(execFile);

/** Setzt die Datenbank auf den Zustand vor der ersten Migration zurück. */
async function resetDatabase(): Promise<void> {
  await withAdmin(async (client) => {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("DROP SCHEMA IF EXISTS app CASCADE");
    await client.query("CREATE SCHEMA public");
  });
}

function runMigrate() {
  return execFileAsync("node", ["scripts/migrate.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_ADMIN_URL: ADMIN_URL, APP_DB_PASSWORD: APP_PASSWORD },
  });
}

describe("scripts/migrate.mjs", () => {
  beforeEach(resetDatabase);

  it("wendet jede Migrationsdatei an und protokolliert sie in schema_migrations", async () => {
    await runMigrate();

    const applied = await withAdmin((client) =>
      client.query<{ name: string }>("SELECT name FROM schema_migrations ORDER BY name"),
    );

    expect(applied.rows.map((r) => r.name)).toEqual([
      "0001_roles_and_schema.sql",
      "0002_auth.sql",
      "0003_app_tables.sql",
      "0004_policies.sql",
      "0005_rate_limit.sql",
      "0006_verification_code_unique.sql",
      "0007_users_column_grants.sql",
    ]);
  });

  it("wendet beim zweiten Lauf nichts erneut an", async () => {
    await runMigrate();
    const firstRun = await withAdmin((client) =>
      client.query<{ name: string; applied_at: Date }>(
        "SELECT name, applied_at FROM schema_migrations ORDER BY name",
      ),
    );

    const { stdout } = await runMigrate();

    const secondRun = await withAdmin((client) =>
      client.query<{ name: string; applied_at: Date }>(
        "SELECT name, applied_at FROM schema_migrations ORDER BY name",
      ),
    );

    expect(stdout).toContain("keine offenen Migrationen");
    // Unveränderte Zeitstempel beweisen, dass keine Datei erneut lief.
    expect(secondRun.rows).toEqual(firstRun.rows);
  });

  it("legt die App-Rolle ohne SUPERUSER und ohne BYPASSRLS an", async () => {
    await runMigrate();

    const role = await withAdmin((client) =>
      client.query<{ rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean }>(
        "SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'platedrop_app'",
      ),
    );

    expect(role.rows).toEqual([{ rolsuper: false, rolbypassrls: false, rolcanlogin: true }]);
  });

  it("setzt das App-Passwort so, dass sich die App-Rolle verbinden kann", async () => {
    await runMigrate();

    const appClient = new Client({
      connectionString: ADMIN_URL.replace(
        "platedrop_owner:test@",
        `platedrop_app:${APP_PASSWORD}@`,
      ),
    });
    await appClient.connect();
    try {
      const who = await appClient.query<{ current_user: string }>("SELECT current_user");
      expect(who.rows[0].current_user).toBe("platedrop_app");
    } finally {
      await appClient.end();
    }
  });
});
