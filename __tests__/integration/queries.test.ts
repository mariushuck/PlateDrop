import { APP_URL, migrateFresh, seedMessage, seedPlate, seedUser, withAdmin } from "./helpers/db";

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

    await insertMessage("KA-AB-1234", "Dein Licht ist an.");

    const stored = await withAdmin((client) =>
      client.query<{ plate_number: string; message_text: string }>(
        "SELECT plate_number, message_text FROM messages",
      ),
    );
    expect(stored.rows).toEqual([
      { plate_number: "KA-AB-1234", message_text: "Dein Licht ist an." },
    ]);
  });

  it("meldet das Erreichen des Kennzeichen-Limits als PlateRateLimitError", async () => {
    const { insertMessage, PlateRateLimitError } = await loadQueries();

    for (let i = 0; i < 20; i++) {
      await insertMessage("KA-AB-1234", `Nachricht ${i}`);
    }

    await expect(insertMessage("KA-AB-1234", "eine zu viel")).rejects.toBeInstanceOf(
      PlateRateLimitError,
    );
  });

  it("zählt das Limit je Kennzeichen getrennt", async () => {
    const { insertMessage } = await loadQueries();

    for (let i = 0; i < 20; i++) {
      await insertMessage("KA-AB-1234", `Nachricht ${i}`);
    }

    await expect(insertMessage("M-XY-9999", "anderes Kennzeichen")).resolves.toBeUndefined();
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

  it("meldet ein bereits vergebenes Kennzeichen als PlateAlreadyClaimedError", async () => {
    const { claimPlate, PlateAlreadyClaimedError } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    await seedPlate(owner, "KA-AB-1234");

    await expect(claimPlate(stranger, "KA-AB-1234", () => "PD-0000")).rejects.toBeInstanceOf(
      PlateAlreadyClaimedError,
    );
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

    await expect(setPlateVerification(admin, plateId, true)).resolves.toBe(true);

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

    await expect(setPlateVerification(admin, plateId, false)).resolves.toBe(true);

    const stored = await withAdmin((client) =>
      client.query<{ is_verified: boolean; verification_status: string }>(
        "SELECT is_verified, verification_status FROM verified_plates",
      ),
    );
    expect(stored.rows).toEqual([{ is_verified: false, verification_status: "rejected" }]);
  });

  it("lässt einen Nicht-Admin kein fremdes Kennzeichen freischalten", async () => {
    const { setPlateVerification } = await loadQueries();
    const owner = await seedUser("user-owner", "owner@example.com");
    const plain = await seedUser("user-plain", "plain@example.com", false);
    const plateId = await seedPlate(owner, "KA-AB-1234");

    await expect(setPlateVerification(plain, plateId, true)).resolves.toBe(false);

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
