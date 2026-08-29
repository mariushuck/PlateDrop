import pg, { type Pool } from "pg";
import { APP_URL, migrateFresh, seedMessage, seedPlate, seedUser, withAdmin } from "./helpers/db";

let appPool: Pool;

/**
 * Führt Anweisungen als App-Rolle im Kontext eines Nutzers aus – exakt so, wie
 * es src/lib/db/context.ts zur Laufzeit tut. `null` steht für eine anonyme
 * Anfrage (öffentliches Drop-Formular).
 */
async function asUser<T>(
  userId: string | null,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await appPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId ?? ""]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

beforeAll(() => {
  appPool = new pg.Pool({ connectionString: APP_URL, max: 4 });
});

afterAll(async () => {
  await appPool.end();
});

describe("RLS: messages", () => {
  beforeEach(migrateFresh);

  it("erlaubt anonymes Schreiben", async () => {
    await asUser(null, (client) =>
      client.query("INSERT INTO messages (plate_number, message_text) VALUES ($1, $2)", [
        "KA-AB-1234",
        "Dein Licht ist an.",
      ]),
    );

    const stored = await withAdmin((client) => client.query("SELECT plate_number FROM messages"));
    expect(stored.rows).toEqual([{ plate_number: "KA-AB-1234" }]);
  });

  it("liefert anonymen Anfragen keine einzige Nachricht zurück", async () => {
    await seedMessage("KA-AB-1234", "geheim");

    const visible = await asUser(null, (client) => client.query("SELECT * FROM messages"));

    expect(visible.rows).toHaveLength(0);
  });

  it("zeigt dem Halter eines verifizierten Kennzeichens seine Nachrichten", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    await seedMessage("KA-AB-1234", "Dein Licht ist an.");

    const visible = await asUser(owner, (client) =>
      client.query<{ message_text: string }>("SELECT message_text FROM messages"),
    );

    expect(visible.rows).toEqual([{ message_text: "Dein Licht ist an." }]);
  });

  it("zeigt einem Nutzer keine Nachrichten an fremde Kennzeichen", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    await seedPlate(stranger, "M-XY-9999", { verified: true, status: "approved" });
    await seedMessage("KA-AB-1234", "nur für den Halter");

    const visible = await asUser(stranger, (client) => client.query("SELECT * FROM messages"));

    expect(visible.rows).toHaveLength(0);
  });

  it("zeigt keine Nachrichten, solange das Kennzeichen unverifiziert ist", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: false, status: "pending" });
    await seedMessage("KA-AB-1234", "noch nicht lesbar");

    const visible = await asUser(owner, (client) => client.query("SELECT * FROM messages"));

    expect(visible.rows).toHaveLength(0);
  });

  // Nachrichten sind unveränderlich. Das setzen zwei Ebenen durch: die App-Rolle
  // bekommt gar kein UPDATE/DELETE-Recht (greift zuerst), und zusätzlich stehen
  // Policies mit USING (false) da, falls je ein Grant hinzukäme.
  it("lässt eine Nachricht nicht ändern", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    await seedMessage("KA-AB-1234", "unveränderlich");

    await expect(
      asUser(owner, (client) => client.query("UPDATE messages SET message_text = 'manipuliert'")),
    ).rejects.toThrow(/permission denied|row-level security/i);

    const stored = await withAdmin((client) =>
      client.query<{ message_text: string }>("SELECT message_text FROM messages"),
    );
    expect(stored.rows).toEqual([{ message_text: "unveränderlich" }]);
  });

  it("lässt eine Nachricht nicht löschen", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    await seedMessage("KA-AB-1234", "unveränderlich");

    await expect(asUser(owner, (client) => client.query("DELETE FROM messages"))).rejects.toThrow(
      /permission denied|row-level security/i,
    );

    const stored = await withAdmin((client) => client.query("SELECT id FROM messages"));
    expect(stored.rows).toHaveLength(1);
  });
});

describe("RLS: verified_plates", () => {
  beforeEach(migrateFresh);

  it("zeigt einem Nutzer nur die eigenen Kennzeichen", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    await seedPlate(owner, "KA-AB-1234");
    await seedPlate(stranger, "M-XY-9999");

    const visible = await asUser(owner, (client) =>
      client.query<{ plate_number: string }>("SELECT plate_number FROM verified_plates"),
    );

    expect(visible.rows).toEqual([{ plate_number: "KA-AB-1234" }]);
  });

  it("lässt einen Nutzer sein Kennzeichen nicht selbst freischalten", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234");

    await expect(
      asUser(owner, (client) =>
        client.query(
          "UPDATE verified_plates SET is_verified = true, verification_status = 'approved'",
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("verhindert das Anlegen eines bereits verifizierten Kennzeichens", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");

    await expect(
      asUser(owner, (client) =>
        client.query(
          `INSERT INTO verified_plates (user_id, plate_number, is_verified, verification_status)
           VALUES ($1, 'KA-AB-1234', true, 'approved')`,
          [owner],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("verhindert das Anlegen eines Kennzeichens auf fremden Namen", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");

    await expect(
      asUser(stranger, (client) =>
        client.query(
          `INSERT INTO verified_plates (user_id, plate_number, is_verified, verification_status)
           VALUES ($1, 'KA-AB-1234', false, 'pending')`,
          [owner],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("erlaubt dem Halter, das Beweisfoto nachzureichen", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    const plateId = await seedPlate(owner, "KA-AB-1234");

    await asUser(owner, (client) =>
      client.query("UPDATE verified_plates SET proof_image_url = $1 WHERE id = $2", [
        "user-owner/proof.jpg",
        plateId,
      ]),
    );

    const stored = await withAdmin((client) =>
      client.query<{ proof_image_url: string }>("SELECT proof_image_url FROM verified_plates"),
    );
    expect(stored.rows).toEqual([{ proof_image_url: "user-owner/proof.jpg" }]);
  });

  it("lässt einen Admin alle offenen Verifizierungen sehen und freigeben", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    const admin = await seedUser("user-admin", "admin@example.com", true);
    const plateId = await seedPlate(owner, "KA-AB-1234");

    const visible = await asUser(admin, (client) => client.query("SELECT id FROM verified_plates"));
    expect(visible.rows).toHaveLength(1);

    await asUser(admin, (client) =>
      client.query(
        "UPDATE verified_plates SET is_verified = true, verification_status = 'approved' WHERE id = $1",
        [plateId],
      ),
    );

    const stored = await withAdmin((client) =>
      client.query<{ is_verified: boolean }>("SELECT is_verified FROM verified_plates"),
    );
    expect(stored.rows).toEqual([{ is_verified: true }]);
  });

  it("gibt einem Nicht-Admin keine fremden Verifizierungen preis", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    const nonAdmin = await seedUser("user-plain", "plain@example.com", false);
    await seedPlate(owner, "KA-AB-1234");

    const visible = await asUser(nonAdmin, (client) =>
      client.query("SELECT id FROM verified_plates"),
    );

    expect(visible.rows).toHaveLength(0);
  });
});
