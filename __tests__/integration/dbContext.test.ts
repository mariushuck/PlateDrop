import { APP_URL, migrateFresh, withAdmin } from "./helpers/db";

type DbContext = typeof import("@/lib/db/context");

let context: DbContext | null = null;

/** Lädt den DB-Kontext frisch – mit genau EINER Verbindung im Pool, damit
 *  sichtbar wird, ob Zustand zwischen zwei Aufrufen hängen bleibt. */
async function loadContext(): Promise<DbContext> {
  process.env.DATABASE_URL = APP_URL;
  process.env.DATABASE_POOL_MAX = "1";
  jest.resetModules();
  context = await import("@/lib/db/context");
  return context;
}

describe("withUser / withAnon", () => {
  beforeAll(migrateFresh);

  afterEach(async () => {
    await context?.closePool();
    context = null;
  });

  it("stellt die Nutzer-ID als Session-Variable bereit", async () => {
    const { withUser } = await loadContext();

    const seen = await withUser("user-42", async (client) => {
      const { rows } = await client.query<{ id: string | null }>(
        "SELECT app.current_user_id() AS id",
      );
      return rows[0].id;
    });

    expect(seen).toBe("user-42");
  });

  it("lässt die Nutzer-ID bei anonymen Anfragen leer", async () => {
    const { withAnon } = await loadContext();

    const seen = await withAnon(async (client) => {
      const { rows } = await client.query<{ id: string | null }>(
        "SELECT app.current_user_id() AS id",
      );
      return rows[0].id;
    });

    expect(seen).toBeNull();
  });

  // Der eigentliche Leak-Test. Er fragt bewusst NICHT über withUser/withAnon ab:
  // die setzen die Variable ja selbst neu und würden ein Durchsickern
  // überdecken. Gefährdet sind Zugriffe, die den Kontext gar nicht durchlaufen –
  // etwa better-auth, das denselben Pool benutzt.
  it("hinterlässt die Nutzer-ID nicht auf der Verbindung im Pool", async () => {
    const { withUser } = await loadContext();
    const { pool } = await import("@/lib/db/pool");

    await withUser("user-42", async (client) => {
      await client.query("SELECT 1");
    });

    // Pool-Größe 1: das ist garantiert derselbe physische Client.
    const { rows } = await pool.query<{ id: string | null }>("SELECT app.current_user_id() AS id");

    expect(rows[0].id).toBeNull();
  });

  it("überschreibt eine Nutzer-ID aus einer vorherigen Anfrage", async () => {
    const { withUser, withAnon } = await loadContext();

    await withUser("user-42", async (client) => {
      await client.query("SELECT 1");
    });

    const seen = await withAnon(async (client) => {
      const { rows } = await client.query<{ id: string | null }>(
        "SELECT app.current_user_id() AS id",
      );
      return rows[0].id;
    });

    expect(seen).toBeNull();
  });

  it("rollt die Transaktion zurück, wenn der Callback wirft", async () => {
    const { withUser } = await loadContext();
    await withAdmin((client) =>
      client.query(
        `INSERT INTO users (id, name, email, "emailVerified", "updatedAt")
         VALUES ('user-42', 'A', 'a@example.com', true, now())`,
      ),
    );

    await expect(
      withUser("user-42", async (client) => {
        await client.query(
          `INSERT INTO verified_plates (user_id, plate_number, is_verified, verification_status)
           VALUES ('user-42', 'KA-AB-1234', false, 'pending')`,
        );
        throw new Error("etwas ging schief");
      }),
    ).rejects.toThrow("etwas ging schief");

    const stored = await withAdmin((client) => client.query("SELECT id FROM verified_plates"));
    expect(stored.rows).toHaveLength(0);
  });

  it("gibt die Verbindung auch nach einem Fehler wieder frei", async () => {
    const { withUser } = await loadContext();

    await expect(
      withUser("user-42", async () => {
        throw new Error("erster Versuch");
      }),
    ).rejects.toThrow("erster Versuch");

    // Bei Pool-Größe 1 käme ein nicht freigegebener Client hier zum Stillstand.
    const seen = await withUser("user-99", async (client) => {
      const { rows } = await client.query<{ id: string }>("SELECT app.current_user_id() AS id");
      return rows[0].id;
    });

    expect(seen).toBe("user-99");
  });
});
