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

type Queries = typeof import("@/lib/db/queries");
type DbContext = typeof import("@/lib/db/context");

let context: DbContext | null = null;

async function loadQueries(): Promise<Queries> {
  process.env.DATABASE_URL = APP_URL;
  process.env.DATABASE_POOL_MAX = "4";
  jest.resetModules();
  context = await import("@/lib/db/context");
  return import("@/lib/db/queries");
}

afterEach(async () => {
  await context?.closePool();
  context = null;
});

describe("insertMessage", () => {
  beforeEach(migrateFresh);

  it("speichert eine Nachricht ohne angemeldeten Nutzer", async () => {
    const { insertMessage } = await loadQueries();

    await insertMessage("KA-AB-1234", "licht_an");

    const stored = await withAdmin((client) =>
      client.query<{ plate_number: string; message_type: string }>(
        "SELECT plate_number, message_type FROM messages",
      ),
    );
    expect(stored.rows).toEqual([{ plate_number: "KA-AB-1234", message_type: "licht_an" }]);
  });

  it("meldet das Erreichen des Kennzeichen-Limits als PlateRateLimitError", async () => {
    const { insertMessage, PlateRateLimitError } = await loadQueries();

    for (let i = 0; i < 20; i++) {
      await insertMessage("KA-AB-1234", "licht_an");
    }

    await expect(insertMessage("KA-AB-1234", "licht_an")).rejects.toBeInstanceOf(
      PlateRateLimitError,
    );
  });

  it("zählt das Limit je Kennzeichen getrennt", async () => {
    const { insertMessage } = await loadQueries();

    for (let i = 0; i < 20; i++) {
      await insertMessage("KA-AB-1234", "licht_an");
    }

    await expect(insertMessage("M-XY-9999", "licht_an")).resolves.toBeUndefined();
  });
});

describe("checkMessageRate", () => {
  beforeEach(migrateFresh);

  it("lässt die ersten zehn Anfragen eines Absenders zu und bremst danach", async () => {
    const { checkMessageRate } = await loadQueries();

    const results: boolean[] = [];
    for (let i = 0; i < 11; i++) {
      results.push(await checkMessageRate("hash-der-ip"));
    }

    expect(results.slice(0, 10)).toEqual(Array(10).fill(true));
    expect(results[10]).toBe(false);
  });

  it("bremst andere Absender dadurch nicht aus", async () => {
    const { checkMessageRate } = await loadQueries();
    for (let i = 0; i < 11; i++) await checkMessageRate("hash-a");

    await expect(checkMessageRate("hash-b")).resolves.toBe(true);
  });

  it("lässt Anfragen ohne bestimmbaren Absender durch", async () => {
    const { checkMessageRate } = await loadQueries();

    await expect(checkMessageRate(null)).resolves.toBe(true);
  });
});

describe("listPlatesForUser", () => {
  beforeEach(migrateFresh);

  it("liefert ausschließlich die Kennzeichen des Nutzers, neueste zuerst", async () => {
    const { listPlatesForUser } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    await seedPlate(owner, "KA-AB-1234");
    await seedPlate(owner, "KA-CD-5678");
    await seedPlate(stranger, "M-XY-9999");

    const plates = await listPlatesForUser(owner);

    expect(plates.map((p) => p.plate_number).sort()).toEqual(["KA-AB-1234", "KA-CD-5678"]);
  });
});

describe("listMessagesForUser", () => {
  beforeEach(migrateFresh);

  it("liefert Nachrichten an verifizierte Kennzeichen des Nutzers, neueste zuerst", async () => {
    const { listMessagesForUser } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    await seedMessage("KA-AB-1234", "ältere");
    await seedMessage("KA-AB-1234", "neuere");

    const messages = await listMessagesForUser(owner);

    expect(messages.map((m) => m.message_text)).toEqual(["neuere", "ältere"]);
  });

  it("liefert nichts für ein noch unverifiziertes Kennzeichen", async () => {
    const { listMessagesForUser } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: false });
    await seedMessage("KA-AB-1234", "noch nicht lesbar");

    await expect(listMessagesForUser(owner)).resolves.toEqual([]);
  });

  it("liefert keine Nachrichten an fremde Kennzeichen", async () => {
    const { listMessagesForUser } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    await seedMessage("KA-AB-1234", "nur für den Halter");

    await expect(listMessagesForUser(stranger)).resolves.toEqual([]);
  });

  it("liefert nur Nachrichten ab 30 Tage vor dem Anspruch", async () => {
    const { listMessagesForUser } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", {
      verified: true,
      status: "approved",
      createdAt: daysAgo(10),
    });
    await seedMessage("KA-AB-1234", "an den Vorbesitzer", daysAgo(400));
    await seedMessage("KA-AB-1234", "im Fenster", daysAgo(39));

    const messages = await listMessagesForUser(owner);

    expect(messages.map((m) => m.message_text)).toEqual(["im Fenster"]);
  });
});

describe("claimPlate", () => {
  beforeEach(migrateFresh);

  it("legt den Claim unverifiziert und mit Status pending an", async () => {
    const { claimPlate } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");

    const plate = await claimPlate(owner, "KA-AB-1234", () => "PD-8X4A");

    expect(plate).toMatchObject({
      plate_number: "KA-AB-1234",
      is_verified: false,
      verification_status: "pending",
      verification_code: "PD-8X4A",
      proof_image_url: null,
    });
  });

  it("würfelt den Verifizierungscode bei einer Kollision neu", async () => {
    const { claimPlate } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");

    // Erster Claim belegt den Code; der zweite Aufruf liefert denselben Code
    // einmal und muss danach auf einen freien ausweichen.
    await claimPlate(owner, "KA-AB-1000", () => "PD-DUPL");

    const codes = ["PD-DUPL", "PD-DUPL", "PD-FREE"];
    const plate = await claimPlate(owner, "KA-AB-2000", () => codes.shift() ?? "PD-XXXX");

    expect(plate.verification_code).toBe("PD-FREE");
  });

  // Ein fremder offener oder freigegebener Claim sperrt niemanden mehr aus
  // (Squatting, Halterwechsel); die Antwort verrät so auch nicht, ob das
  // Kennzeichen schon registriert ist. Entschieden wird bei der Freigabe.
  it("lässt ein fremd beanspruchtes Kennzeichen erneut beanspruchen", async () => {
    const { claimPlate } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });

    const plate = await claimPlate(stranger, "KA-AB-1234", () => "PD-0000");

    expect(plate).toMatchObject({ plate_number: "KA-AB-1234", verification_status: "pending" });
  });

  it("meldet einen doppelten eigenen Claim als PlateAlreadyClaimedError", async () => {
    const { claimPlate, PlateAlreadyClaimedError } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234");

    await expect(claimPlate(owner, "KA-AB-1234", () => "PD-0000")).rejects.toBeInstanceOf(
      PlateAlreadyClaimedError,
    );
  });

  it("erlaubt höchstens drei offene Claims je Nutzer", async () => {
    const { claimPlate, TooManyOpenClaimsError } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1");
    await seedPlate(owner, "KA-AB-2");
    await seedPlate(owner, "KA-AB-3");
    // Freigegebene und abgelehnte zählen nicht als offen.
    await seedPlate(owner, "KA-AB-4", { verified: true, status: "approved" });
    await seedPlate(owner, "KA-AB-5", { status: "rejected" });

    await expect(claimPlate(owner, "KA-AB-6", () => "PD-0006")).rejects.toBeInstanceOf(
      TooManyOpenClaimsError,
    );
  });
});

describe("exportUserData", () => {
  beforeEach(migrateFresh);

  it("liefert nur die Kennzeichen und Nachrichten des Nutzers", async () => {
    const { exportUserData } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    await seedPlate(stranger, "M-XY-9999", { verified: true, status: "approved" });
    await seedMessage("KA-AB-1234", "für den Halter");
    await seedMessage("M-XY-9999", "für jemand anderen");

    const data = await exportUserData(owner);

    expect(data.plates.map((p) => p.plate_number)).toEqual(["KA-AB-1234"]);
    expect(data.messages.map((m) => m.message_text)).toEqual(["für den Halter"]);
  });

  it("liefert keine Nachrichten an noch unverifizierte Kennzeichen", async () => {
    const { exportUserData } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: false });
    await seedMessage("KA-AB-1234", "noch nicht lesbar");

    const data = await exportUserData(owner);

    expect(data.messages).toEqual([]);
  });

  it("exportiert nur Nachrichten ab 30 Tage vor dem Anspruch", async () => {
    const { exportUserData } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", {
      verified: true,
      status: "approved",
      createdAt: daysAgo(10),
    });
    await seedMessage("KA-AB-1234", "an den Vorbesitzer", daysAgo(400));
    await seedMessage("KA-AB-1234", "im Fenster", daysAgo(39));

    const data = await exportUserData(owner);

    expect(data.messages.map((m) => m.message_text)).toEqual(["im Fenster"]);
  });
});

describe("plateBelongsToUser", () => {
  beforeEach(migrateFresh);

  it("erkennt das eigene Kennzeichen und weist ein fremdes ab", async () => {
    const { plateBelongsToUser } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    const plateId = await seedPlate(owner, "KA-AB-1234");

    await expect(plateBelongsToUser(owner, plateId)).resolves.toBe(true);
    await expect(plateBelongsToUser(stranger, plateId)).resolves.toBe(false);
    await expect(plateBelongsToUser(owner, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).resolves.toBe(
      false,
    );
  });
});

describe("deletePlate", () => {
  beforeEach(migrateFresh);

  it("entfernt das eigene Kennzeichen und gibt den Fotopfad zurück", async () => {
    const { deletePlate } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const plateId = await seedPlate(owner, "KA-AB-1234", { proofPath: "user-owner/foto.jpg" });

    await expect(deletePlate(owner, plateId)).resolves.toEqual({
      deleted: true,
      proofPath: "user-owner/foto.jpg",
    });
    const left = await withAdmin((client) => client.query("SELECT id FROM verified_plates"));
    expect(left.rows).toHaveLength(0);
  });

  it("lässt ein fremdes Kennzeichen stehen", async () => {
    const { deletePlate } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    const plateId = await seedPlate(owner, "KA-AB-1234");

    await expect(deletePlate(stranger, plateId)).resolves.toEqual({
      deleted: false,
      proofPath: null,
    });
    const left = await withAdmin((client) => client.query("SELECT id FROM verified_plates"));
    expect(left.rows).toHaveLength(1);
  });
});

describe("setProofPath", () => {
  beforeEach(migrateFresh);

  it("hinterlegt den Pfad am eigenen Kennzeichen", async () => {
    const { setProofPath } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const plateId = await seedPlate(owner, "KA-AB-1234");

    await expect(setProofPath(owner, plateId, "user-owner/proof.jpg")).resolves.toEqual({
      updated: true,
      previousPath: null,
    });

    const stored = await withAdmin((client) =>
      client.query<{ proof_image_url: string }>("SELECT proof_image_url FROM verified_plates"),
    );
    expect(stored.rows).toEqual([{ proof_image_url: "user-owner/proof.jpg" }]);
  });

  it("ändert nichts an einem fremden Kennzeichen", async () => {
    const { setProofPath } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    const plateId = await seedPlate(owner, "KA-AB-1234");

    await expect(setProofPath(stranger, plateId, "user-stranger/fremd.jpg")).resolves.toEqual({
      updated: false,
      previousPath: null,
    });

    const stored = await withAdmin((client) =>
      client.query<{ proof_image_url: string | null }>(
        "SELECT proof_image_url FROM verified_plates",
      ),
    );
    expect(stored.rows).toEqual([{ proof_image_url: null }]);
  });

  it("gibt den bisherigen Pfad zurück, damit die alte Datei entfernt werden kann", async () => {
    const { setProofPath } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const plateId = await seedPlate(owner, "KA-AB-1234", { proofPath: "user-owner/alt.jpg" });

    await expect(setProofPath(owner, plateId, "user-owner/neu.jpg")).resolves.toEqual({
      updated: true,
      previousPath: "user-owner/alt.jpg",
    });
  });

  // Ohne diesen Rücksprung bliebe ein neu hochgeladenes Foto für den Admin
  // unsichtbar – dessen Liste zeigt ausschließlich Kennzeichen mit Status
  // "pending".
  it("stellt ein abgelehntes Kennzeichen wieder in die Warteschlange", async () => {
    const { setProofPath } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const plateId = await seedPlate(owner, "KA-AB-1234", {
      status: "rejected",
      proofPath: "user-owner/abgelehnt.jpg",
    });

    await expect(setProofPath(owner, plateId, "user-owner/zweiter-versuch.jpg")).resolves.toEqual({
      updated: true,
      previousPath: "user-owner/abgelehnt.jpg",
    });

    const stored = await withAdmin((client) =>
      client.query<{ verification_status: string; proof_image_url: string }>(
        "SELECT verification_status, proof_image_url FROM verified_plates",
      ),
    );
    expect(stored.rows).toEqual([
      { verification_status: "pending", proof_image_url: "user-owner/zweiter-versuch.jpg" },
    ]);
  });

  it("lässt ein abgelehntes Kennzeichen danach wieder beim Admin auftauchen", async () => {
    const { setProofPath, listPendingVerifications } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const admin = await seedUser("user-admin", "admin@example.com", true);
    const plateId = await seedPlate(owner, "KA-AB-1234", {
      status: "rejected",
      proofPath: "user-owner/abgelehnt.jpg",
    });

    await expect(listPendingVerifications(admin)).resolves.toEqual([]);

    await setProofPath(owner, plateId, "user-owner/zweiter-versuch.jpg");

    const pending = await listPendingVerifications(admin);
    expect(pending.map((p) => p.plate_number)).toEqual(["KA-AB-1234"]);
  });
});

describe("Admin-Abläufe", () => {
  beforeEach(migrateFresh);

  it("listet offene Verifizierungen mit Beweisfoto für einen Admin", async () => {
    const { listPendingVerifications } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const admin = await seedUser("user-admin", "admin@example.com", true);
    await seedPlate(owner, "KA-AB-1234", { proofPath: "user-owner/proof.jpg" });
    await seedPlate(owner, "KA-CD-5678"); // ohne Foto – noch nichts zu prüfen

    const pending = await listPendingVerifications(admin);

    expect(pending.map((p) => p.plate_number)).toEqual(["KA-AB-1234"]);
  });

  it("liefert einem Nicht-Admin keine offenen Verifizierungen", async () => {
    const { listPendingVerifications } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const plain = await seedUser("user-plain", "plain@example.com", false);
    await seedPlate(owner, "KA-AB-1234", { proofPath: "user-owner/proof.jpg" });

    await expect(listPendingVerifications(plain)).resolves.toEqual([]);
  });

  it("schaltet ein Kennzeichen als Admin frei", async () => {
    const { setPlateVerification } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const admin = await seedUser("user-admin", "admin@example.com", true);
    const plateId = await seedPlate(owner, "KA-AB-1234", { proofPath: "user-owner/proof.jpg" });

    await expect(setPlateVerification(admin, plateId, true)).resolves.toEqual({
      changed: true,
      plateNumber: "KA-AB-1234",
      supersededEmails: [],
    });

    const stored = await withAdmin((client) =>
      client.query<{ is_verified: boolean; verification_status: string }>(
        "SELECT is_verified, verification_status FROM verified_plates",
      ),
    );
    expect(stored.rows).toEqual([{ is_verified: true, verification_status: "approved" }]);
  });

  it("lehnt ein Kennzeichen als Admin ab, ohne es freizuschalten", async () => {
    const { setPlateVerification } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const admin = await seedUser("user-admin", "admin@example.com", true);
    const plateId = await seedPlate(owner, "KA-AB-1234", { proofPath: "user-owner/proof.jpg" });

    await expect(setPlateVerification(admin, plateId, false)).resolves.toEqual({
      changed: true,
      plateNumber: "KA-AB-1234",
      supersededEmails: [],
    });

    const stored = await withAdmin((client) =>
      client.query<{ is_verified: boolean; verification_status: string }>(
        "SELECT is_verified, verification_status FROM verified_plates",
      ),
    );
    expect(stored.rows).toEqual([{ is_verified: false, verification_status: "rejected" }]);
  });

  it("löst bei der Freigabe die Konkurrenz um dasselbe Kennzeichen auf", async () => {
    const { setPlateVerification } = await loadQueries();
    const previous = await seedUser("user-previous", "previous@example.com");
    const winner = await seedUser("user-winner", "winner@example.com");
    const loser = await seedUser("user-loser", "loser@example.com");
    const admin = await seedUser("user-admin", "admin@example.com", true);
    await seedPlate(previous, "KA-AB-1234", { verified: true, status: "approved" });
    const winnerPlate = await seedPlate(winner, "KA-AB-1234", { proofPath: "user-winner/a.jpg" });
    await seedPlate(loser, "KA-AB-1234", { proofPath: "user-loser/b.jpg" });
    await seedPlate(loser, "M-XY-9999"); // anderes Kennzeichen bleibt unberührt

    await expect(setPlateVerification(admin, winnerPlate, true)).resolves.toEqual({
      changed: true,
      plateNumber: "KA-AB-1234",
      supersededEmails: ["previous@example.com"],
    });

    const stored = await withAdmin((client) =>
      client.query<{ user_id: string; plate_number: string; verification_status: string }>(
        `SELECT user_id, plate_number, verification_status FROM verified_plates
          ORDER BY plate_number, user_id`,
      ),
    );
    expect(stored.rows).toEqual([
      { user_id: "user-loser", plate_number: "KA-AB-1234", verification_status: "rejected" },
      { user_id: "user-previous", plate_number: "KA-AB-1234", verification_status: "superseded" },
      { user_id: "user-winner", plate_number: "KA-AB-1234", verification_status: "approved" },
      { user_id: "user-loser", plate_number: "M-XY-9999", verification_status: "pending" },
    ]);
  });

  it("zeigt dem Admin, ob es schon einen freigegebenen Halter gibt", async () => {
    const { listPendingVerifications } = await loadQueries();
    const previous = await seedUser("user-previous", "previous@example.com");
    const owner = await seedUser("user-owner", "owner@example.com");
    const admin = await seedUser("user-admin", "admin@example.com", true);
    await seedPlate(previous, "KA-AB-1234", { verified: true, status: "approved" });
    await seedPlate(owner, "KA-AB-1234", { proofPath: "user-owner/a.jpg" });
    await seedPlate(owner, "M-XY-9999", { proofPath: "user-owner/b.jpg" });

    const pending = await listPendingVerifications(admin);

    expect(pending.map((p) => [p.plate_number, p.has_approved_holder]).sort()).toEqual([
      ["KA-AB-1234", true],
      ["M-XY-9999", false],
    ]);
  });

  it("lässt einen Nicht-Admin kein fremdes Kennzeichen freischalten", async () => {
    const { setPlateVerification } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const plain = await seedUser("user-plain", "plain@example.com", false);
    const plateId = await seedPlate(owner, "KA-AB-1234");

    await expect(setPlateVerification(plain, plateId, true)).resolves.toEqual({
      changed: false,
      plateNumber: null,
      supersededEmails: [],
    });

    const stored = await withAdmin((client) =>
      client.query<{ is_verified: boolean }>("SELECT is_verified FROM verified_plates"),
    );
    expect(stored.rows).toEqual([{ is_verified: false }]);
  });
});

describe("canReadProof", () => {
  beforeEach(migrateFresh);

  it("erlaubt dem Halter den Zugriff auf sein Beweisfoto", async () => {
    const { canReadProof } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { proofPath: "user-owner/proof.jpg" });

    await expect(canReadProof(owner, "user-owner/proof.jpg")).resolves.toBe(true);
  });

  it("erlaubt einem Admin den Zugriff auf jedes Beweisfoto", async () => {
    const { canReadProof } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const admin = await seedUser("user-admin", "admin@example.com", true);
    await seedPlate(owner, "KA-AB-1234", { proofPath: "user-owner/proof.jpg" });

    await expect(canReadProof(admin, "user-owner/proof.jpg")).resolves.toBe(true);
  });

  it("verwehrt einem fremden Nutzer den Zugriff", async () => {
    const { canReadProof } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    await seedPlate(owner, "KA-AB-1234", { proofPath: "user-owner/proof.jpg" });

    await expect(canReadProof(stranger, "user-owner/proof.jpg")).resolves.toBe(false);
  });

  it("verwehrt den Zugriff auf einen Pfad, zu dem es kein Kennzeichen gibt", async () => {
    const { canReadProof } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { proofPath: "user-owner/proof.jpg" });

    await expect(canReadProof(owner, "user-owner/gibt-es-nicht.jpg")).resolves.toBe(false);
  });
});

async function firstMessageId(): Promise<string> {
  const { rows } = await withAdmin((client) =>
    client.query<{ id: string }>("SELECT id FROM messages ORDER BY created_at LIMIT 1"),
  );
  return rows[0].id;
}

describe("Empfänger-Kontrolle", () => {
  beforeEach(migrateFresh);

  it("blendet eine Nachricht für den Empfänger aus", async () => {
    const { hideMessage, listMessagesForUser } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    await seedMessage("KA-AB-1234", "lästig");
    const id = await firstMessageId();

    await expect(hideMessage(stranger, id)).resolves.toBe(false);
    await expect(hideMessage(owner, id)).resolves.toBe(true);
    await expect(listMessagesForUser(owner)).resolves.toEqual([]);
  });

  it("meldet und blendet in einem Schritt aus, ein zweites Melden ist harmlos", async () => {
    const { reportMessage, listMessagesForUser } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    await seedMessage("KA-AB-1234", "beleidigend");
    const id = await firstMessageId();

    await expect(reportMessage(owner, id, "Beleidigung")).resolves.toBe(true);
    await expect(reportMessage(owner, id, "Beleidigung")).resolves.toBe(true);

    await expect(listMessagesForUser(owner)).resolves.toEqual([]);
    const reports = await withAdmin((client) =>
      client.query<{ reason: string }>("SELECT reason FROM message_reports"),
    );
    expect(reports.rows).toEqual([{ reason: "Beleidigung" }]);
  });

  it("lässt nicht melden, was der Nutzer nicht lesen darf", async () => {
    const { reportMessage } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    await seedMessage("KA-AB-1234", "privat");

    await expect(reportMessage(stranger, await firstMessageId(), "Spam")).resolves.toBe(false);
  });

  it("zeigt einem Admin offene Meldungen samt Nachricht und lässt ihn entscheiden", async () => {
    const { reportMessage, listOpenReports, resolveReport, deleteReportedMessage } =
      await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const admin = await seedUser("user-admin", "admin@example.com", true);
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    await seedMessage("KA-AB-1234", "erste");
    await seedMessage("KA-AB-1234", "zweite");
    const ids = (
      await withAdmin((client) =>
        client.query<{ id: string }>("SELECT id FROM messages ORDER BY message_text"),
      )
    ).rows.map((r) => r.id);
    await reportMessage(owner, ids[0], "Spam");
    await reportMessage(owner, ids[1], "Bedrohung");

    await expect(listOpenReports(owner)).resolves.toEqual([]);
    const open = await listOpenReports(admin);
    expect(open.map((r) => [r.message_text, r.reason]).sort()).toEqual([
      ["erste", "Spam"],
      ["zweite", "Bedrohung"],
    ]);

    const first = open.find((r) => r.message_text === "erste");
    const second = open.find((r) => r.message_text === "zweite");
    await expect(resolveReport(owner, first?.id ?? "")).resolves.toBe(false);
    await expect(resolveReport(admin, first?.id ?? "")).resolves.toBe(true);
    await expect(deleteReportedMessage(admin, second?.message_id ?? "")).resolves.toBe(true);

    await expect(listOpenReports(admin)).resolves.toEqual([]);
    const left = await withAdmin((client) =>
      client.query<{ message_text: string }>("SELECT message_text FROM messages"),
    );
    expect(left.rows).toEqual([{ message_text: "erste" }]);
  });

  it("setzt die Pause nur am eigenen Kennzeichen", async () => {
    const { setPlatePause } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    const plateId = await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    const until = new Date(Date.now() + 86_400_000);

    await expect(setPlatePause(stranger, plateId, until)).resolves.toBe(false);
    await expect(setPlatePause(owner, plateId, until)).resolves.toBe(true);
    await expect(setPlatePause(owner, plateId, null)).resolves.toBe(true);
  });
});

describe("Organisationen: Standort und Nachrichten", () => {
  beforeEach(migrateFresh);

  it("löst ein Token auf und kennt deaktivierte Standorte", async () => {
    const { siteByToken } = await loadQueries();
    const { siteId, token } = await seedOrg("firma");

    await expect(siteByToken(token)).resolves.toMatchObject({
      siteId,
      orgName: "firma",
      active: true,
    });
    await expect(siteByToken("x".repeat(22))).resolves.toBeNull();
    await withAdmin((client) => client.query("UPDATE org_sites SET disabled_at = now()"));
    await expect(siteByToken(token)).resolves.toMatchObject({ active: false });
  });

  it("schreibt Standort-Nachrichten anonym und als Mitglied mit Freitext", async () => {
    const { insertSiteMessage } = await loadQueries();
    const { orgId, siteId } = await seedOrg("firma", { allowFreeText: true });
    const member = await seedUser("user-member", "member@example.com");
    await seedMember(siteId, member);

    await insertSiteMessage(null, {
      plate: "KA-AB-1",
      type: "blockiert",
      text: null,
      orgId,
      siteId,
    });
    await insertSiteMessage(member, {
      plate: "KA-AB-1",
      type: null,
      text: "Bitte umparken",
      orgId,
      siteId,
    });

    const stored = await withAdmin((client) =>
      client.query(
        "SELECT message_type, message_text, sender_id FROM messages ORDER BY created_at",
      ),
    );
    expect(stored.rows).toEqual([
      { message_type: "blockiert", message_text: null, sender_id: null },
      { message_type: null, message_text: "Bitte umparken", sender_id: "user-member" },
    ]);
  });

  it("listet Nachrichten je Kennzeichen-Zeile mit Standort und erlaubtem Absendernamen", async () => {
    const { listMessagesForUser } = await loadQueries();
    const { orgId, siteId } = await seedOrg("firma", { showSender: true });
    const owner = await seedUser("user-owner", "owner@example.com");
    const sender = await seedUser("user-sender", "sender@example.com");
    await withAdmin((client) =>
      client.query("UPDATE users SET name = 'Erika' WHERE id = $1", [sender]),
    );
    await seedMember(siteId, owner);
    const publicPlate = await seedPlate(owner, "KA-AB-1", { verified: true, status: "approved" });
    const orgPlate = await seedPlate(owner, "KA-AB-1", {
      verified: true,
      status: "approved",
      orgId,
    });
    await seedMessage("KA-AB-1", "öffentlich", daysAgo(1));
    await withAdmin((client) =>
      client.query(
        `INSERT INTO messages (plate_number, message_text, org_id, site_id, sender_id)
         VALUES ('KA-AB-1', 'am Standort', $1, $2, $3)`,
        [orgId, siteId, sender],
      ),
    );

    const messages = await listMessagesForUser(owner);

    expect(messages.map((m) => [m.message_text, m.plate_id, m.site_name, m.sender_name])).toEqual([
      ["am Standort", orgPlate, "firma-standort", "Erika"],
      ["öffentlich", publicPlate, null, null],
    ]);
  });
});

describe("Organisationen: Mitgliedschaft und Kennzeichen", () => {
  beforeEach(migrateFresh);

  it("beantragt, bestätigt und beendet eine Mitgliedschaft", async () => {
    const { requestSiteMembership, listOrgMembers, setMemberActive, listMyMemberships, leaveSite } =
      await loadQueries();
    const { orgId, siteId } = await seedOrg("firma");
    const admin = await seedUser("user-orgadmin", "orgadmin@example.com");
    const user = await seedUser("user-new", "new@example.com");
    await seedOrgAdmin(orgId, admin);

    await requestSiteMembership(user, siteId);
    expect((await listOrgMembers(admin, orgId)).map((m) => [m.email, m.status])).toEqual([
      ["new@example.com", "pending"],
    ]);
    await expect(listOrgMembers(user, orgId)).resolves.toEqual([]);

    await expect(setMemberActive(user, siteId, user)).resolves.toBe(false);
    await expect(setMemberActive(admin, siteId, user)).resolves.toBe(true);
    expect((await listMyMemberships(user)).map((m) => [m.org_name, m.status])).toEqual([
      ["firma", "active"],
    ]);

    await leaveSite(user, siteId);
    await expect(listMyMemberships(user)).resolves.toEqual([]);
  });

  it("lässt Org-Admins nur Kennzeichen ihrer Organisation freigeben, Konkurrenz je Bereich", async () => {
    const { claimPlate, setPlateVerification, listOrgPlates, listPendingVerifications } =
      await loadQueries();
    const { orgId, siteId } = await seedOrg("firma");
    const admin = await seedUser("user-orgadmin", "orgadmin@example.com");
    const platformAdmin = await seedUser("user-admin", "admin@example.com", true);
    const member = await seedUser("user-member", "member@example.com");
    const publicOwner = await seedUser("user-public", "public@example.com");
    await seedOrgAdmin(orgId, admin);
    await seedMember(siteId, member);
    // Öffentlicher Halter derselben Nummer darf durch die Org-Freigabe nicht abgelöst werden.
    await seedPlate(publicOwner, "KA-AB-1", { verified: true, status: "approved" });
    const publicPending = await seedPlate(member, "M-X-1", { proofPath: "user-member/a.jpg" });

    const orgPlate = await claimPlate(member, "KA-AB-1", () => "PD-0001", orgId);
    expect(orgPlate).toMatchObject({ org_id: orgId, verification_code: null });

    await expect(setPlateVerification(admin, publicPending, true)).resolves.toMatchObject({
      changed: false,
    });
    await expect(setPlateVerification(admin, orgPlate.id, true)).resolves.toEqual({
      changed: true,
      plateNumber: "KA-AB-1",
      supersededEmails: [],
    });
    expect(
      (await listOrgPlates(admin, orgId)).map((p) => [
        p.plate_number,
        p.email,
        p.verification_status,
      ]),
    ).toEqual([["KA-AB-1", "member@example.com", "approved"]]);

    const statuses = await withAdmin((client) =>
      client.query("SELECT user_id, verification_status FROM verified_plates ORDER BY user_id"),
    );
    expect(statuses.rows).toContainEqual({
      user_id: "user-public",
      verification_status: "approved",
    });

    // Die Plattform-Freigabe sieht nur öffentliche Ansprüche.
    expect((await listPendingVerifications(platformAdmin)).map((p) => p.plate_number)).toEqual([
      "M-X-1",
    ]);
  });

  it("pflegt Standorte, Fuhrparkliste, Einstellungen und Statistik als Org-Admin", async () => {
    const q = await loadQueries();
    const { orgId } = await seedOrg("firma");
    const admin = await seedUser("user-orgadmin", "orgadmin@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    await seedOrgAdmin(orgId, admin);

    await expect(q.orgForAdmin(stranger, "firma")).resolves.toBeNull();
    await expect(q.orgForAdmin(admin, "firma")).resolves.toMatchObject({
      id: orgId,
      slug: "firma",
    });

    const created = await q.createSite(admin, orgId, "Tiefgarage", "t".repeat(22));
    await expect(q.createSite(stranger, orgId, "fremd", "f".repeat(22))).rejects.toThrow();
    await expect(q.setSiteDisabled(admin, created, true)).resolves.toBe(true);
    await expect(q.renewSiteToken(admin, created, "n".repeat(22))).resolves.toBe(true);
    expect((await q.listOrgSites(admin, orgId)).map((s) => [s.name, s.token, s.disabled])).toEqual([
      ["firma-standort", expect.any(String), false],
      ["Tiefgarage", "n".repeat(22), true],
    ]);

    await q.addAllowlistPlate(admin, orgId, "KA-F-1");
    await expect(q.listAllowlist(admin, orgId)).resolves.toEqual(["KA-F-1"]);
    await q.removeAllowlistPlate(admin, orgId, "KA-F-1");
    await expect(q.listAllowlist(admin, orgId)).resolves.toEqual([]);

    await expect(
      q.updateOrgSettings(stranger, orgId, { showSender: true, allowFreeText: true }),
    ).resolves.toBe(false);
    await expect(
      q.updateOrgSettings(admin, orgId, { showSender: true, allowFreeText: false }),
    ).resolves.toBe(true);

    const siteId = await seedSite(orgId, "werk-2");
    await seedMessage("KA-AB-1", "x", undefined, { orgId, siteId });
    expect((await q.orgWeeklyStats(admin, orgId)).map((r) => [r.site_name, r.incidents])).toEqual([
      ["werk-2", 1],
    ]);
  });
});
