/**
 * @jest-environment node
 */
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Proofs = typeof import("@/lib/storage/proofs");

const OWNER = "11111111-2222-3333-4444-555555555555";
const PLATE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

// Gültige Byte-Signaturen – saveProof erkennt das Format daran, nicht am
// Client-Content-Type.
const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function jpeg(name = "beweis.jpg"): File {
  return new File([JPEG_MAGIC], name, { type: "image/jpeg" });
}

let root: string;

async function loadProofs(): Promise<Proofs> {
  // PROOFS_DIR liegt eine Ebene TIEFER als das Wegwerf-Verzeichnis, damit ein
  // "../" im Test innerhalb dieses Laufs bleibt und nichts Fremdes trifft.
  const sandbox = await mkdtemp(join(tmpdir(), "platedrop-proofs-"));
  root = join(sandbox, "proofs");
  await mkdir(root, { recursive: true });
  process.env.PROOFS_DIR = root;
  jest.resetModules();
  return import("@/lib/storage/proofs");
}

describe("saveProof", () => {
  it("legt die Datei unter dem Nutzerpräfix ab und gibt den relativen Pfad zurück", async () => {
    const { saveProof } = await loadProofs();

    const objectPath = await saveProof(OWNER, PLATE, jpeg());

    expect(objectPath).toMatch(new RegExp(`^${OWNER}/${PLATE}-\\d+\\.jpg$`));
    await expect(readFile(join(root, objectPath))).resolves.toEqual(Buffer.from(JPEG_MAGIC));
  });

  it("leitet die Endung aus der Byte-Signatur ab, nicht aus Dateiname oder Content-Type", async () => {
    const { saveProof } = await loadProofs();
    // PNG-Signatur, aber irreführender Name und Content-Type.
    const file = new File([PNG_MAGIC], "beweis.php", { type: "image/jpeg" });

    const objectPath = await saveProof(OWNER, PLATE, file);

    expect(objectPath.endsWith(".png")).toBe(true);
  });

  it("legt nichts an, wenn die Nutzer-ID keine UUID ist", async () => {
    const { saveProof, InvalidProofPathError } = await loadProofs();

    // Die Prüfung muss VOR dem Anlegen des Verzeichnisses greifen, sonst
    // entstünde der Ordner trotzdem – hier außerhalb des proofs-Verzeichnisses.
    await expect(saveProof("../ausbruch", PLATE, jpeg())).rejects.toBeInstanceOf(
      InvalidProofPathError,
    );
    // Der Ordner darf gar nicht erst entstanden sein.
    await expect(access(join(root, "..", "ausbruch"))).rejects.toThrow();
  });

  it("weist eine Datei zurück, deren Signatur kein erlaubtes Bild ist", async () => {
    const { saveProof, UnsupportedProofTypeError } = await loadProofs();
    // Als Bild deklariert, aber SVG-Inhalt.
    const file = new File([Buffer.from("<svg xmlns='...'></svg>")], "schad.png", {
      type: "image/png",
    });

    await expect(saveProof(OWNER, PLATE, file)).rejects.toBeInstanceOf(UnsupportedProofTypeError);
  });

  it("weist eine Datei mit gefälschtem Content-Type ab (Bytes ≠ Bild)", async () => {
    const { saveProof, UnsupportedProofTypeError } = await loadProofs();
    const file = new File([Buffer.from("MZ\x90\x00 nicht wirklich ein Bild")], "harmlos.jpg", {
      type: "image/jpeg",
    });

    await expect(saveProof(OWNER, PLATE, file)).rejects.toBeInstanceOf(UnsupportedProofTypeError);
  });
});

describe("readProof", () => {
  it("liefert Bytes und Content-Type einer abgelegten Datei", async () => {
    const { saveProof, readProof } = await loadProofs();
    const objectPath = await saveProof(OWNER, PLATE, jpeg());

    const result = await readProof(objectPath);

    expect(result).toEqual({ bytes: Buffer.from(JPEG_MAGIC), contentType: "image/jpeg" });
  });

  it("liefert null, wenn es die Datei nicht gibt", async () => {
    const { readProof } = await loadProofs();

    await expect(readProof(`${OWNER}/${PLATE}-1.jpg`)).resolves.toBeNull();
  });

  it.each([
    ["Verzeichniswechsel", `${OWNER}/../../etc/passwd`],
    ["kodierter Verzeichniswechsel", `${OWNER}/..%2F..%2Fetc%2Fpasswd`],
    ["absoluter Pfad", "/etc/passwd"],
    ["fehlendes Nutzerpräfix", "beweis.jpg"],
    ["Nutzerpräfix ist keine UUID", "../beweis.jpg"],
    ["zusätzliche Ebene", `${OWNER}/unter/beweis.jpg`],
    ["leerer Pfad", ""],
  ])("weist %s zurück", async (_label, badPath) => {
    const { readProof, InvalidProofPathError } = await loadProofs();

    await expect(readProof(badPath)).rejects.toBeInstanceOf(InvalidProofPathError);
  });

  it("liest keine Datei außerhalb des proofs-Verzeichnisses", async () => {
    const { readProof, InvalidProofPathError } = await loadProofs();
    // Eine echte Datei daneben – ein durchgerutschter Pfad wäre hier sichtbar.
    await mkdir(join(root, "..", "geheim"), { recursive: true });
    await writeFile(join(root, "..", "geheim", "secret.jpg"), "streng geheim");

    await expect(readProof(`${OWNER}/../geheim/secret.jpg`)).rejects.toBeInstanceOf(
      InvalidProofPathError,
    );
  });
});

describe("deleteProof", () => {
  it("entfernt eine abgelegte Datei", async () => {
    const { saveProof, deleteProof, readProof } = await loadProofs();
    const objectPath = await saveProof(OWNER, PLATE, jpeg());

    await deleteProof(objectPath);

    await expect(readProof(objectPath)).resolves.toBeNull();
  });

  it("verträgt eine bereits fehlende Datei", async () => {
    const { deleteProof } = await loadProofs();

    // Ein zweiter Aufruf darf nicht scheitern – sonst bräuchte jeder Aufrufer
    // eine eigene Existenzprüfung.
    await expect(deleteProof(`${OWNER}/${PLATE}-1.jpg`)).resolves.toBeUndefined();
  });

  it.each([
    ["Verzeichniswechsel", `${OWNER}/../../etc/passwd`],
    ["absoluter Pfad", "/etc/passwd"],
    ["fehlendes Nutzerpräfix", "beweis.jpg"],
  ])("weist %s zurück", async (_label, badPath) => {
    const { deleteProof, InvalidProofPathError } = await loadProofs();

    await expect(deleteProof(badPath)).rejects.toBeInstanceOf(InvalidProofPathError);
  });

  it("löscht nichts außerhalb des proofs-Verzeichnisses", async () => {
    const { deleteProof, InvalidProofPathError } = await loadProofs();
    await mkdir(join(root, "..", "geheim"), { recursive: true });
    await writeFile(join(root, "..", "geheim", "secret.jpg"), "streng geheim");

    await expect(deleteProof(`${OWNER}/../geheim/secret.jpg`)).rejects.toBeInstanceOf(
      InvalidProofPathError,
    );
    await expect(readFile(join(root, "..", "geheim", "secret.jpg"), "utf8")).resolves.toBe(
      "streng geheim",
    );
  });
});
