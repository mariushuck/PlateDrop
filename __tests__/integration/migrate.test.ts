import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";
import { ADMIN_URL, APP_PASSWORD, seedUser, withAdmin } from "./helpers/db";

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
      "0008_plate_format.sql",
      "0009_message_read_window.sql",
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

  // Vor 0008 wurden Kennzeichen ohne Trennstriche gespeichert ("KAAB1234"). Der
  // Test stellt diesen Zustand her und lässt 0008 über den echten Runner laufen.
  it("wandelt eindeutige Altkennzeichen um und entzieht mehrdeutigen die Freigabe", async () => {
    await runMigrate();
    const owner = await seedUser("user-owner", "owner@example.com");
    await withAdmin(async (client) => {
      await client.query(
        "ALTER TABLE verified_plates DROP CONSTRAINT verified_plates_plate_format_check",
      );
      await client.query("ALTER TABLE messages DROP CONSTRAINT messages_plate_format_check");
      await client.query("DELETE FROM schema_migrations WHERE name = '0008_plate_format.sql'");
      await client.query(
        `INSERT INTO verified_plates (user_id, plate_number, is_verified, verification_status)
         VALUES ($1, 'BM123', true, 'approved'),
                ($1, 'ABCDE12', false, 'pending'),
                ($1, 'KAAB1234', true, 'approved')`,
        [owner],
      );
      await client.query(
        `INSERT INTO messages (plate_number, message_text)
         VALUES ('BM123', 'eindeutig'), ('KAAB1234', 'mehrdeutig')`,
      );
    });

    await runMigrate();

    const plates = await withAdmin((client) =>
      client.query<{ plate_number: string; is_verified: boolean; verification_status: string }>(
        "SELECT plate_number, is_verified, verification_status FROM verified_plates ORDER BY plate_number",
      ),
    );
    expect(plates.rows).toEqual([
      { plate_number: "ABC-DE-12", is_verified: false, verification_status: "pending" },
      { plate_number: "B-M-123", is_verified: true, verification_status: "approved" },
      // Mehrdeutig: bleibt im Altformat stehen, verliert aber die Freigabe,
      // bis ein Admin es anhand des Fotos zuordnet.
      { plate_number: "KAAB1234", is_verified: false, verification_status: "pending" },
    ]);

    const messages = await withAdmin((client) =>
      client.query<{ plate_number: string }>(
        "SELECT plate_number FROM messages ORDER BY plate_number",
      ),
    );
    expect(messages.rows).toEqual([{ plate_number: "B-M-123" }, { plate_number: "KAAB1234" }]);

    // Neue Zeilen im Altformat lässt die Formatprüfung nicht mehr zu.
    await expect(
      withAdmin((client) =>
        client.query("INSERT INTO messages (plate_number, message_text) VALUES ('KAAB1234', 'x')"),
      ),
    ).rejects.toThrow(/messages_plate_format_check/);
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
