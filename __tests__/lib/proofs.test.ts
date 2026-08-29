/**
 * @jest-environment node
 */
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Proofs = typeof import("@/lib/storage/proofs");

const OWNER = "11111111-2222-3333-4444-555555555555";
const PLATE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

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
    const file = new File([new Uint8Array([1, 2, 3])], "beweis.jpg", { type: "image/jpeg" });

    const objectPath = await saveProof(OWNER, PLATE, file);

    expect(objectPath).toMatch(new RegExp(`^${OWNER}/${PLATE}-\\d+\\.jpg$`));
    await expect(readFile(join(root, objectPath))).resolves.toEqual(Buffer.from([1, 2, 3]));
  });

  it("leitet die Endung aus dem Dateityp ab, nicht aus dem Dateinamen", async () => {
    const { saveProof } = await loadProofs();
    // Ein manipulierter Dateiname darf die Endung auf der Platte nicht bestimmen.
    const file = new File([new Uint8Array([1])], "beweis.php", { type: "image/png" });

    const objectPath = await saveProof(OWNER, PLATE, file);

    expect(objectPath.endsWith(".png")).toBe(true);
  });

  it("legt nichts an, wenn die Nutzer-ID keine UUID ist", async () => {
    const { saveProof, InvalidProofPathError } = await loadProofs();
    const file = new File([new Uint8Array([1])], "beweis.jpg", { type: "image/jpeg" });

    // Die Prüfung muss VOR dem Anlegen des Verzeichnisses greifen, sonst
    // entstünde der Ordner trotzdem – hier außerhalb des proofs-Verzeichnisses.
    await expect(saveProof("../ausbruch", PLATE, file)).rejects.toBeInstanceOf(
      InvalidProofPathError,
    );
    // Der Ordner darf gar nicht erst entstanden sein.
    await expect(access(join(root, "..", "ausbruch"))).rejects.toThrow();
  });

  it("weist eine Datei zurück, die kein unterstütztes Bild ist", async () => {
    const { saveProof, UnsupportedProofTypeError } = await loadProofs();
    const file = new File([new Uint8Array([1])], "schad.svg", { type: "image/svg+xml" });

    await expect(saveProof(OWNER, PLATE, file)).rejects.toBeInstanceOf(UnsupportedProofTypeError);
  });
});

describe("readProof", () => {
  it("liefert Bytes und Content-Type einer abgelegten Datei", async () => {
    const { saveProof, readProof } = await loadProofs();
    const file = new File([new Uint8Array([9, 9])], "beweis.jpg", { type: "image/jpeg" });
    const objectPath = await saveProof(OWNER, PLATE, file);

    const result = await readProof(objectPath);

    expect(result).toEqual({ bytes: Buffer.from([9, 9]), contentType: "image/jpeg" });
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
