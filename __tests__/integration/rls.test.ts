import pg, { type Pool } from "pg";
import {
  APP_URL,
  daysAgo,
  migrateFresh,
  seedMember,
  seedMessage,
  seedOrg,
  seedOrgAdmin,
  seedPlate,
  seedSite,
  seedUser,
  withAdmin,
} from "./helpers/db";

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
      client.query("INSERT INTO messages (plate_number, message_type) VALUES ($1, $2)", [
        "KA-AB-1234",
        "licht_an",
      ]),
    );

    const stored = await withAdmin((client) => client.query("SELECT plate_number FROM messages"));
    expect(stored.rows).toEqual([{ plate_number: "KA-AB-1234" }]);
  });

  it("liefert anonymen Anfragen keine einzige Nachricht zurück", async () => {
    await seedMessage("KA-AB-1234", "geheim");

    const visible = await asUser(null, (client) => client.query("SELECT id FROM messages"));

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

    const visible = await asUser(stranger, (client) => client.query("SELECT id FROM messages"));

    expect(visible.rows).toHaveLength(0);
  });

  // Halterwechsel: der abgelöste Halter verliert den Zugriff sofort, der neue
  // liest ab 30 Tage vor seinem eigenen Anspruch.
  it("übergibt das Lesen beim Halterwechsel vom alten an den neuen Halter", async () => {
    const previous = await seedUser("user-previous", "previous@example.com");
    const next = await seedUser("user-next", "next@example.com");
    await seedPlate(previous, "KA-AB-1234", {
      status: "superseded",
      createdAt: daysAgo(400),
    });
    await seedPlate(next, "KA-AB-1234", {
      verified: true,
      status: "approved",
      createdAt: daysAgo(5),
    });
    await seedMessage("KA-AB-1234", "an den Vorbesitzer", daysAgo(100));
    await seedMessage("KA-AB-1234", "an den neuen Halter", daysAgo(1));

    const readPrevious = await asUser(previous, (client) =>
      client.query("SELECT message_text FROM messages"),
    );
    const readNext = await asUser(next, (client) =>
      client.query<{ message_text: string }>("SELECT message_text FROM messages"),
    );

    expect(readPrevious.rows).toHaveLength(0);
    expect(readNext.rows).toEqual([{ message_text: "an den neuen Halter" }]);
  });

  // Anonyme Absender wählen nur aus dem Katalog (0013). Freitext bliebe sonst
  // das größte Missbrauchs- und Haftungsrisiko.
  it("lässt anonym keinen Freitext schreiben", async () => {
    await expect(
      asUser(null, (client) =>
        client.query(
          "INSERT INTO messages (plate_number, message_type, message_text) VALUES ($1, $2, $3)",
          ["KA-AB-1234", "licht_an", "beliebiger Text"],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("lässt anonym nur Katalog-Typen schreiben", async () => {
    await expect(
      asUser(null, (client) =>
        client.query("INSERT INTO messages (plate_number, message_type) VALUES ($1, $2)", [
          "KA-AB-1234",
          "erfunden",
        ]),
      ),
    ).rejects.toThrow(/messages_type_check/);
  });

  // Zeitstempel und Status setzt die Datenbank. Ein rückdatierter created_at
  // würde das Stundenlimit je Kennzeichen umgehen.
  it("lässt beim Schreiben weder Zeitpunkt noch Status vorgeben", async () => {
    await expect(
      asUser(null, (client) =>
        client.query(
          "INSERT INTO messages (plate_number, message_type, created_at) VALUES ($1, $2, $3)",
          ["KA-AB-1234", "licht_an", "2020-01-01"],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("lässt anonym nur Kennzeichen in kanonischer Form schreiben", async () => {
    // Im Kompaktformat wären K-AB-1234 und KA-B-1234 derselbe Wert.
    await expect(
      asUser(null, (client) =>
        client.query("INSERT INTO messages (plate_number, message_type) VALUES ($1, $2)", [
          "KAB1234",
          "licht_an",
        ]),
      ),
    ).rejects.toThrow(/messages_plate_format_check/);
  });

  // Kennzeichen werden neu vergeben. Ein neuer Halter soll nicht lesen, was
  // Jahre vorher an den Vorbesitzer ging — wohl aber eine Notiz, die kurz vor
  // seiner Registrierung hinterlassen wurde.
  it("zeigt Nachrichten erst ab 30 Tage vor dem Anspruch", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", {
      verified: true,
      status: "approved",
      createdAt: daysAgo(10),
    });
    await seedMessage("KA-AB-1234", "an den Vorbesitzer", daysAgo(400));
    await seedMessage("KA-AB-1234", "knapp vor dem Fenster", daysAgo(41));
    await seedMessage("KA-AB-1234", "kurz vor der Registrierung", daysAgo(39));
    await seedMessage("KA-AB-1234", "nach der Registrierung", daysAgo(1));

    const visible = await asUser(owner, (client) =>
      client.query<{ message_text: string }>(
        "SELECT message_text FROM messages ORDER BY created_at",
      ),
    );

    expect(visible.rows).toEqual([
      { message_text: "kurz vor der Registrierung" },
      { message_text: "nach der Registrierung" },
    ]);
  });

  it("zeigt keine Nachrichten, solange das Kennzeichen unverifiziert ist", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: false, status: "pending" });
    await seedMessage("KA-AB-1234", "noch nicht lesbar");

    const visible = await asUser(owner, (client) => client.query("SELECT id FROM messages"));

    expect(visible.rows).toHaveLength(0);
  });

  // Der Inhalt einer Nachricht ist unveränderlich: die App-Rolle darf nur
  // hidden_at ändern (Grant, 0012), und das nur als Empfänger (Policy).
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

  // Löschen darf nur ein Admin, und nur eine gemeldete Nachricht (0012).
  it("lässt den Empfänger eine Nachricht nicht löschen", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    await seedMessage("KA-AB-1234", "unveränderlich");

    const deleted = await asUser(owner, (client) => client.query("DELETE FROM messages"));
    expect(deleted.rowCount).toBe(0);

    const stored = await withAdmin((client) => client.query("SELECT id FROM messages"));
    expect(stored.rows).toHaveLength(1);
  });
});

async function messageId(): Promise<string> {
  const { rows } = await withAdmin((client) =>
    client.query<{ id: string }>("SELECT id FROM messages LIMIT 1"),
  );
  return rows[0].id;
}

describe("RLS: Empfänger-Kontrolle (Ausblenden, Melden, Pausieren)", () => {
  beforeEach(migrateFresh);

  it("lässt den Empfänger eine Nachricht ausblenden, einen Fremden nicht", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    await seedMessage("KA-AB-1234", "lästig");

    const byStranger = await asUser(stranger, (client) =>
      client.query("UPDATE messages SET hidden_at = now()"),
    );
    expect(byStranger.rowCount).toBe(0);

    const byOwner = await asUser(owner, (client) =>
      client.query("UPDATE messages SET hidden_at = now()"),
    );
    expect(byOwner.rowCount).toBe(1);
  });

  it("lässt den Empfänger melden, aber keine Nachricht, die er nicht lesen darf", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    await seedMessage("KA-AB-1234", "beleidigend");
    const id = await messageId();

    await expect(
      asUser(stranger, (client) =>
        client.query(
          "INSERT INTO message_reports (message_id, reporter_id, reason) VALUES ($1, $2, 'x')",
          [id, stranger],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);

    await asUser(owner, (client) =>
      client.query(
        "INSERT INTO message_reports (message_id, reporter_id, reason) VALUES ($1, $2, 'Beleidigung')",
        [id, owner],
      ),
    );
    const visibleToStranger = await asUser(stranger, (client) =>
      client.query("SELECT id FROM message_reports"),
    );
    expect(visibleToStranger.rows).toHaveLength(0);
  });

  it("lässt nur einen Admin Meldungen sehen, erledigen und die Nachricht löschen", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    const admin = await seedUser("user-admin", "admin@example.com", true);
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    await seedMessage("KA-AB-1234", "beleidigend");
    await seedMessage("KA-AB-1234", "harmlos");
    const reported = (
      await withAdmin((client) =>
        client.query<{ id: string }>("SELECT id FROM messages WHERE message_text = 'beleidigend'"),
      )
    ).rows[0].id;
    await withAdmin((client) =>
      client.query(
        "INSERT INTO message_reports (message_id, reporter_id, reason) VALUES ($1, $2, 'x')",
        [reported, owner],
      ),
    );

    // Der Melder darf seine Meldung nicht selbst erledigen.
    const byOwner = await asUser(owner, (client) =>
      client.query("UPDATE message_reports SET resolved_at = now()"),
    );
    expect(byOwner.rowCount).toBe(0);

    // Der Admin sieht nur die gemeldete Nachricht, nicht die übrigen.
    const adminSees = await asUser(admin, (client) =>
      client.query<{ message_text: string }>("SELECT message_text FROM messages"),
    );
    expect(adminSees.rows).toEqual([{ message_text: "beleidigend" }]);

    const deleted = await asUser(admin, (client) => client.query("DELETE FROM messages"));
    expect(deleted.rowCount).toBe(1);
    const left = await withAdmin((client) =>
      client.query<{ message_text: string }>("SELECT message_text FROM messages"),
    );
    expect(left.rows).toEqual([{ message_text: "harmlos" }]);
  });

  it("lässt den Halter nur die Pause des eigenen Kennzeichens setzen", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    const plateId = await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });

    const byStranger = await asUser(stranger, (client) =>
      client.query<{ ok: boolean }>(
        "SELECT app.set_plate_pause($1, now() + interval '1 day') AS ok",
        [plateId],
      ),
    );
    expect(byStranger.rows[0].ok).toBe(false);

    const byOwner = await asUser(owner, (client) =>
      client.query<{ ok: boolean }>(
        "SELECT app.set_plate_pause($1, now() + interval '1 day') AS ok",
        [plateId],
      ),
    );
    expect(byOwner.rows[0].ok).toBe(true);

    // Direkt per UPDATE kommt der Halter an die Spalte nicht heran.
    await expect(
      asUser(owner, (client) =>
        client.query("UPDATE verified_plates SET paused_until = NULL WHERE id = $1", [plateId]),
      ),
    ).rejects.toThrow(/permission denied/i);
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

  // Nach einer Ablehnung muss der Halter ein neues Foto nachreichen können,
  // sonst ist das Kennzeichen dauerhaft blockiert – die Nummer bleibt durch den
  // Unique-Constraint belegt.
  it("erlaubt dem Halter, nach einer Ablehnung ein neues Foto nachzureichen", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    const plateId = await seedPlate(owner, "KA-AB-1234", { status: "rejected" });

    await asUser(owner, (client) =>
      client.query(
        `UPDATE verified_plates
            SET proof_image_url = $1, verification_status = 'pending'
          WHERE id = $2`,
        ["user-owner/zweiter-versuch.jpg", plateId],
      ),
    );

    const stored = await withAdmin((client) =>
      client.query<{ verification_status: string; proof_image_url: string }>(
        "SELECT verification_status, proof_image_url FROM verified_plates",
      ),
    );
    expect(stored.rows).toEqual([
      { verification_status: "pending", proof_image_url: "user-owner/zweiter-versuch.jpg" },
    ]);
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

  it("lässt den Halter das Kennzeichen seines Claims nicht umschreiben", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    const plateId = await seedPlate(owner, "KA-AB-1234");

    await expect(
      asUser(owner, (client) =>
        client.query("UPDATE verified_plates SET plate_number = 'M-XY-9999' WHERE id = $1", [
          plateId,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("koppelt is_verified fest an den Status approved", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    const admin = await seedUser("user-admin", "admin@example.com", true);
    const plateId = await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });

    await expect(
      asUser(admin, (client) =>
        client.query(
          "UPDATE verified_plates SET verification_status = 'superseded' WHERE id = $1",
          [plateId],
        ),
      ),
    ).rejects.toThrow(/check constraint/i);
  });

  it("erlaubt mehrere offene Claims auf ein Kennzeichen, aber nur einen freigegebenen", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    const admin = await seedUser("user-admin", "admin@example.com", true);
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });

    await asUser(stranger, (client) =>
      client.query(
        `INSERT INTO verified_plates (user_id, plate_number, is_verified, verification_status)
         VALUES ($1, 'KA-AB-1234', false, 'pending')`,
        [stranger],
      ),
    );

    await expect(
      asUser(admin, (client) =>
        client.query(
          `UPDATE verified_plates SET is_verified = true, verification_status = 'approved'
            WHERE user_id = $1`,
          [stranger],
        ),
      ),
    ).rejects.toThrow(/verified_plates_one_approved/);
  });

  // Geschützt doppelt: DELETE mit WHERE sieht nur Zeilen, die auch
  // verified_plates_select_own freigibt. Erst wenn beide Policies fallen, schlägt
  // der Test fehl (geprüft).
  it("lässt den Halter sein Kennzeichen entfernen, ein fremdes nicht", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    const ownPlate = await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    const foreignPlate = await seedPlate(stranger, "M-XY-9999");

    const deleted = await asUser(owner, (client) =>
      client.query("DELETE FROM verified_plates WHERE id = ANY($1)", [[ownPlate, foreignPlate]]),
    );
    expect(deleted.rowCount).toBe(1);

    const stored = await withAdmin((client) =>
      client.query<{ plate_number: string }>("SELECT plate_number FROM verified_plates"),
    );
    expect(stored.rows).toEqual([{ plate_number: "M-XY-9999" }]);
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

describe("Grants: users.is_admin", () => {
  beforeEach(migrateFresh);

  it("lässt die App-Rolle is_admin nicht setzen", async () => {
    const plain = await seedUser("user-plain", "plain@example.com", false);

    await expect(
      asUser(plain, (client) =>
        client.query("UPDATE users SET is_admin = true WHERE id = $1", [plain]),
      ),
    ).rejects.toThrow(/permission denied/i);

    const stored = await withAdmin((client) =>
      client.query<{ is_admin: boolean }>("SELECT is_admin FROM users WHERE id = $1", [plain]),
    );
    expect(stored.rows).toEqual([{ is_admin: false }]);
  });

  it("lässt die App-Rolle weiterhin unkritische Profilfelder schreiben", async () => {
    const plain = await seedUser("user-plain", "plain@example.com", false);

    await asUser(plain, (client) =>
      client.query("UPDATE users SET name = $2 WHERE id = $1", [plain, "Neuer Name"]),
    );

    const stored = await withAdmin((client) =>
      client.query<{ name: string }>("SELECT name FROM users WHERE id = $1", [plain]),
    );
    expect(stored.rows).toEqual([{ name: "Neuer Name" }]);
  });
});

/** Nachrichten-Texte, die der Nutzer lesen darf. */
async function readable(userId: string): Promise<string[]> {
  const { rows } = await asUser(userId, (client) =>
    client.query<{ message_text: string }>("SELECT message_text FROM messages ORDER BY 1"),
  );
  return rows.map((r) => r.message_text);
}

// Größtes Risiko für ein Datenleck zwischen Mandanten (strategy.md §3.7):
// jede Regel hier einzeln, mit öffentlichem Bereich als Gegenpol.
describe("RLS: Mandantentrennung", () => {
  beforeEach(migrateFresh);

  it("trennt öffentliche und Organisations-Nachrichten an dasselbe Kennzeichen", async () => {
    const { orgId, siteId } = await seedOrg("firma");
    const member = await seedUser("user-member", "member@example.com");
    const publicOwner = await seedUser("user-public", "public@example.com");
    await seedMember(siteId, member);
    await seedPlate(member, "KA-AB-1234", { verified: true, status: "approved", orgId });
    await seedPlate(publicOwner, "KA-AB-1234", { verified: true, status: "approved" });
    await seedMessage("KA-AB-1234", "öffentlich");
    await seedMessage("KA-AB-1234", "am Standort", undefined, { orgId, siteId });

    expect(await readable(member)).toEqual(["am Standort"]);
    expect(await readable(publicOwner)).toEqual(["öffentlich"]);
  });

  it("lässt nur aktive Mitglieder des Standorts lesen", async () => {
    const { orgId, siteId } = await seedOrg("verwaltung");
    const otherSite = await seedSite(orgId, "objekt-b");
    const here = await seedUser("user-here", "here@example.com");
    const elsewhere = await seedUser("user-elsewhere", "elsewhere@example.com");
    const pending = await seedUser("user-pending", "pending@example.com");
    await seedMember(siteId, here);
    await seedMember(otherSite, elsewhere);
    await seedMember(siteId, pending, "pending");
    await seedMember(otherSite, pending);
    for (const user of [here, elsewhere, pending]) {
      await seedPlate(user, `KA-${user === here ? "A" : user === elsewhere ? "B" : "C"}-1`, {
        verified: true,
        status: "approved",
        orgId,
      });
    }
    await seedMessage("KA-A-1", "an here", undefined, { orgId, siteId });
    await seedMessage("KA-B-1", "an elsewhere", undefined, { orgId, siteId });
    await seedMessage("KA-C-1", "an pending", undefined, { orgId, siteId });

    expect(await readable(here)).toEqual(["an here"]);
    expect(await readable(elsewhere)).toEqual([]);
    expect(await readable(pending)).toEqual([]);
  });

  it("beendet Zugriff und Kennzeichen sofort, wenn die Mitgliedschaft endet", async () => {
    const { orgId, siteId } = await seedOrg("firma");
    const member = await seedUser("user-member", "member@example.com");
    const admin = await seedUser("user-orgadmin", "orgadmin@example.com");
    await seedOrgAdmin(orgId, admin);
    await seedMember(siteId, member);
    await seedPlate(member, "KA-AB-1234", { verified: true, status: "approved", orgId });
    await seedMessage("KA-AB-1234", "vorher", undefined, { orgId, siteId });

    expect(await readable(member)).toEqual(["vorher"]);
    await asUser(admin, (client) =>
      client.query("DELETE FROM site_members WHERE user_id = $1", [member]),
    );

    expect(await readable(member)).toEqual([]);
    const plate = await withAdmin((client) =>
      client.query<{ verification_status: string }>(
        "SELECT verification_status FROM verified_plates WHERE user_id = $1",
        [member],
      ),
    );
    expect(plate.rows).toEqual([{ verification_status: "expired" }]);
  });

  it("lässt Org-Admins verwalten, aber keine Nachrichten lesen", async () => {
    const { orgId, siteId } = await seedOrg("firma");
    const member = await seedUser("user-member", "member@example.com");
    const admin = await seedUser("user-orgadmin", "orgadmin@example.com");
    await seedOrgAdmin(orgId, admin);
    await seedMember(siteId, member);
    const plateId = await seedPlate(member, "KA-AB-1234", { orgId });
    await seedMessage("KA-AB-1234", "privat", undefined, { orgId, siteId });

    await asUser(admin, (client) =>
      client.query(
        "UPDATE verified_plates SET is_verified = true, verification_status = 'approved' WHERE id = $1",
        [plateId],
      ),
    );
    expect(await readable(admin)).toEqual([]);
    expect(await readable(member)).toEqual(["privat"]);
  });

  it("gibt Org-Admins keinen Zugriff auf fremde Organisationen", async () => {
    const own = await seedOrg("eigene");
    const foreign = await seedOrg("fremde");
    const admin = await seedUser("user-orgadmin", "orgadmin@example.com");
    const foreignMember = await seedUser("user-foreign", "foreign@example.com");
    await seedOrgAdmin(own.orgId, admin);
    await seedMember(foreign.siteId, foreignMember, "pending");
    const foreignPlate = await seedPlate(foreignMember, "M-XY-1", { orgId: foreign.orgId });

    const seen = await asUser(admin, async (client) => ({
      plates: (await client.query("SELECT id FROM verified_plates")).rows.length,
      members: (await client.query("SELECT user_id FROM site_members")).rows.length,
      sites: (await client.query("SELECT id FROM org_sites")).rows.map((r) => r.id),
      orgs: (await client.query("SELECT slug FROM organizations")).rows.map((r) => r.slug),
    }));
    expect(seen).toEqual({ plates: 0, members: 0, sites: [own.siteId], orgs: ["eigene"] });

    const approve = await asUser(admin, (client) =>
      client.query(
        "UPDATE verified_plates SET is_verified = true, verification_status = 'approved' WHERE id = $1",
        [foreignPlate],
      ),
    );
    expect(approve.rowCount).toBe(0);
    const activate = await asUser(admin, (client) =>
      client.query("UPDATE site_members SET status = 'active' WHERE user_id = $1", [foreignMember]),
    );
    expect(activate.rowCount).toBe(0);
  });

  it("verbietet fremde Absender, unpassende Standorte und anonymen Freitext", async () => {
    const { orgId, siteId } = await seedOrg("firma", { allowFreeText: true });
    const other = await seedOrg("andere");
    const member = await seedUser("user-member", "member@example.com");
    const outsider = await seedUser("user-outsider", "outsider@example.com");
    await seedMember(siteId, member);
    const insert = (userId: string | null, values: unknown[]) =>
      asUser(userId, (client) =>
        client.query(
          `INSERT INTO messages (plate_number, message_type, message_text, org_id, site_id, sender_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          values,
        ),
      );

    await expect(
      insert(outsider, ["KA-AB-1", "licht_an", null, orgId, siteId, member]),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      insert(null, ["KA-AB-1", "licht_an", null, orgId, other.siteId, null]),
    ).rejects.toThrow(/messages_site_in_org/);
    await expect(insert(null, ["KA-AB-1", null, "anonym", orgId, siteId, null])).rejects.toThrow(
      /row-level security/i,
    );
    await expect(
      insert(outsider, ["KA-AB-1", null, "kein Mitglied", orgId, siteId, outsider]),
    ).rejects.toThrow(/row-level security/i);

    await insert(member, ["KA-AB-1", null, "Bitte umparken", orgId, siteId, member]);
    await insert(null, ["KA-AB-1", "licht_an", null, orgId, siteId, null]);
  });

  it("verbietet Freitext, wenn die Organisation ihn nicht erlaubt", async () => {
    const { orgId, siteId } = await seedOrg("streng");
    const member = await seedUser("user-member", "member@example.com");
    await seedMember(siteId, member);

    await expect(
      asUser(member, (client) =>
        client.query(
          `INSERT INTO messages (plate_number, message_text, org_id, site_id, sender_id)
           VALUES ('KA-AB-1', 'Text', $1, $2, $3)`,
          [orgId, siteId, member],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("hält die Absender-ID verborgen und zeigt den Namen nur, wenn erlaubt", async () => {
    const visible = await seedOrg("offen", { showSender: true });
    const hidden = await seedOrg("verdeckt");
    const sender = await seedUser("user-sender", "sender@example.com");
    const owner = await seedUser("user-owner", "owner@example.com");
    await withAdmin((client) =>
      client.query("UPDATE users SET name = 'Erika' WHERE id = $1", [sender]),
    );
    for (const org of [visible, hidden]) {
      await seedMember(org.siteId, owner);
      await seedPlate(owner, `KA-${org === visible ? "V" : "H"}-1`, {
        verified: true,
        status: "approved",
        orgId: org.orgId,
      });
      await withAdmin((client) =>
        client.query(
          `INSERT INTO messages (plate_number, message_type, org_id, site_id, sender_id)
           VALUES ($1, 'blockiert', $2, $3, $4)`,
          [`KA-${org === visible ? "V" : "H"}-1`, org.orgId, org.siteId, sender],
        ),
      );
    }

    await expect(
      asUser(owner, (client) => client.query("SELECT sender_id FROM messages")),
    ).rejects.toThrow(/permission denied/i);

    const names = await asUser(owner, (client) =>
      client.query<{ plate_number: string; sender: string | null }>(
        `SELECT plate_number, app.message_sender_name(id) AS sender FROM messages ORDER BY 1`,
      ),
    );
    expect(names.rows).toEqual([
      { plate_number: "KA-H-1", sender: null },
      { plate_number: "KA-V-1", sender: "Erika" },
    ]);
  });

  it("lässt nur Mitglieder ein Org-Kennzeichen beanspruchen; Fuhrparkliste gibt sofort frei", async () => {
    const { orgId, siteId } = await seedOrg("firma");
    const member = await seedUser("user-member", "member@example.com");
    const outsider = await seedUser("user-outsider", "outsider@example.com");
    await seedMember(siteId, member);
    await withAdmin((client) =>
      client.query("INSERT INTO org_plate_allowlist (org_id, plate_number) VALUES ($1, 'KA-F-1')", [
        orgId,
      ]),
    );
    const claim = (userId: string, plate: string) =>
      asUser(userId, (client) =>
        client.query(
          `INSERT INTO verified_plates (user_id, plate_number, is_verified, verification_status, org_id)
           VALUES ($1, $2, false, 'pending', $3)`,
          [userId, plate, orgId],
        ),
      );

    await expect(claim(outsider, "KA-F-1")).rejects.toThrow(/row-level security/i);
    await claim(member, "KA-F-1");
    await claim(member, "KA-X-2");

    const stored = await withAdmin((client) =>
      client.query<{ plate_number: string; verification_status: string }>(
        "SELECT plate_number, verification_status FROM verified_plates ORDER BY 1",
      ),
    );
    expect(stored.rows).toEqual([
      { plate_number: "KA-F-1", verification_status: "approved" },
      { plate_number: "KA-X-2", verification_status: "pending" },
    ]);
  });

  it("lässt Nutzer nur einen Beitritt beantragen, nicht sich selbst freischalten", async () => {
    const { siteId } = await seedOrg("firma");
    const user = await seedUser("user-new", "new@example.com");

    await expect(
      asUser(user, (client) =>
        client.query(
          "INSERT INTO site_members (site_id, user_id, status) VALUES ($1, $2, 'active')",
          [siteId, user],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);

    await asUser(user, (client) =>
      client.query("INSERT INTO site_members (site_id, user_id) VALUES ($1, $2)", [siteId, user]),
    );
    const activated = await asUser(user, (client) =>
      client.query("UPDATE site_members SET status = 'active' WHERE user_id = $1", [user]),
    );
    expect(activated.rowCount).toBe(0);
  });

  it("löst über das Token genau einen Standort auf, ohne Tabellenzugriff", async () => {
    const { siteId, token } = await seedOrg("firma");
    await seedOrg("andere");

    const site = await asUser(null, (client) =>
      client.query<{ site_id: string; active: boolean }>(
        "SELECT site_id, active FROM app.site_by_token($1)",
        [token],
      ),
    );
    expect(site.rows).toEqual([{ site_id: siteId, active: true }]);

    const direct = await asUser(null, (client) => client.query("SELECT id FROM org_sites"));
    expect(direct.rows).toHaveLength(0);
  });

  it("zeigt Statistik und Einstellungen nur Org-Admins", async () => {
    const { orgId, siteId } = await seedOrg("firma");
    const admin = await seedUser("user-orgadmin", "orgadmin@example.com");
    const member = await seedUser("user-member", "member@example.com");
    await seedOrgAdmin(orgId, admin);
    await seedMember(siteId, member);
    await seedMessage("KA-AB-1", "eins", undefined, { orgId, siteId });
    await seedMessage("KA-AB-2", "zwei", undefined, { orgId, siteId });

    const stats = (userId: string) =>
      asUser(userId, (client) =>
        client.query<{ incidents: string }>("SELECT incidents FROM app.org_weekly_stats($1)", [
          orgId,
        ]),
      );
    expect((await stats(admin)).rows.map((r) => Number(r.incidents))).toEqual([2]);
    expect((await stats(member)).rows).toEqual([]);

    const byMember = await asUser(member, (client) =>
      client.query("UPDATE organizations SET allow_free_text = true WHERE id = $1", [orgId]),
    );
    expect(byMember.rowCount).toBe(0);
    const byAdmin = await asUser(admin, (client) =>
      client.query("UPDATE organizations SET allow_free_text = true WHERE id = $1", [orgId]),
    );
    expect(byAdmin.rowCount).toBe(1);
  });
});
