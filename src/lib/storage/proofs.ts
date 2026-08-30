import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";

/**
 * Beweisfotos liegen im Dateisystem statt in einem Objektspeicher — ein
 * Docker-Volume genügt, ein zusätzlicher Container wäre für diesen Zweck
 * überdimensioniert. Ausgeliefert werden sie nie direkt, sondern über den
 * Route Handler unter /api/proofs, der bei jedem Abruf die Berechtigung prüft.
 * Damit ersetzen wir die vorherigen kurzlebigen Signed URLs durch eine
 * Prüfung, die zum Zeitpunkt des Zugriffs stattfindet.
 */

/** Erlaubte Bildtypen samt Dateiendung. SVG fehlt bewusst: es kann Skripte enthalten. */
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

const EXTENSION_TO_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

/**
 * `<uuid>/<uuid>-<zeitstempel>.<endung>` — genau zwei Segmente, keine
 * Sonderzeichen, kein Punkt-Punkt. Alles andere wird abgewiesen, bevor
 * überhaupt ein Pfad gebaut wird.
 */
const OBJECT_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9-]+\.(jpg|png|webp|heic)$/;

export class InvalidProofPathError extends Error {
  constructor() {
    super("Ungültiger Pfad für ein Beweisfoto.");
    this.name = "InvalidProofPathError";
  }
}

export class UnsupportedProofTypeError extends Error {
  constructor() {
    super("Nicht unterstütztes Bildformat.");
    this.name = "UnsupportedProofTypeError";
  }
}

function proofsRoot(): string {
  return resolve(process.env.PROOFS_DIR ?? "/data/proofs");
}

/**
 * Übersetzt einen Objektpfad in einen absoluten Pfad — und verweigert alles,
 * was aus dem proofs-Verzeichnis herausführen würde. Zwei Prüfungen, weil sie
 * unterschiedliche Angriffe abdecken: das Muster hält Unerwartetes fern, der
 * Präfixvergleich fängt alles ab, was sich doch daran vorbeimogelt.
 */
function resolveObjectPath(objectPath: string): string {
  if (!objectPath || isAbsolute(objectPath) || !OBJECT_PATH_PATTERN.test(objectPath)) {
    throw new InvalidProofPathError();
  }

  const root = proofsRoot();
  const absolute = resolve(join(root, objectPath));

  // Backstop. Beim aktuellen Muster ist dieser Zweig nicht erreichbar – es
  // lässt weder Schrägstriche noch Punkte im Dateinamen zu. Er steht hier für
  // den Fall, dass das Muster einmal gelockert wird: dann bleibt der Schutz.
  if (absolute !== root && !absolute.startsWith(root + sep)) {
    throw new InvalidProofPathError();
  }

  return absolute;
}

/**
 * Erkennt das Bildformat an der Byte-Signatur. Client-`file.type` und
 * Dateiname sind frei wählbar, die Signatur nicht.
 *
 * @returns erkannter MIME-Typ oder `null`.
 */
function sniffImageType(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  // ISO-BMFF: `....ftyp<brand>` – HEIC/HEIF und Varianten (typisch von iPhones).
  if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") {
    const brand = bytes.toString("ascii", 8, 12);
    const heicBrands = [
      "heic",
      "heix",
      "heim",
      "heis",
      "hevc",
      "hevx",
      "hevm",
      "hevs",
      "mif1",
      "msf1",
    ];
    if (heicBrands.includes(brand)) {
      return "image/heic";
    }
  }
  return null;
}

/**
 * Speichert ein Beweisfoto unter dem Präfix des Nutzers.
 *
 * @returns Objektpfad relativ zum proofs-Verzeichnis. Der gehört in
 *          `verified_plates.proof_image_url`.
 * @throws {UnsupportedProofTypeError} wenn die Byte-Signatur kein erlaubtes
 *         Bildformat ergibt.
 */
export async function saveProof(userId: string, plateId: string, file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());

  // Endung und Typ kommen aus der Byte-Signatur — nicht aus dem Client-
  // Content-Type und erst recht nicht aus dem Dateinamen.
  const detectedType = sniffImageType(buffer);
  const extension = detectedType ? ALLOWED_TYPES[detectedType] : undefined;
  if (!extension) {
    throw new UnsupportedProofTypeError();
  }

  const objectPath = `${userId}/${plateId}-${Date.now()}.${extension}`;
  const absolute = resolveObjectPath(objectPath);

  await mkdir(join(proofsRoot(), userId), { recursive: true });
  await writeFile(absolute, buffer);

  return objectPath;
}

/**
 * Liest ein Beweisfoto. Prüft NICHT, ob der Abrufende es sehen darf — das
 * entscheidet canReadProof() in src/lib/db/queries.ts anhand der Policies.
 *
 * @returns `null`, wenn es die Datei nicht gibt.
 * @throws {InvalidProofPathError} bei einem Pfad, der nicht in das Verzeichnis gehört.
 */
export async function readProof(
  objectPath: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const absolute = resolveObjectPath(objectPath);
  const extension = objectPath.split(".").pop() as string;

  try {
    const bytes = await readFile(absolute);
    return { bytes, contentType: EXTENSION_TO_TYPE[extension] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Entfernt ein Beweisfoto. Wird gebraucht, sobald ein Foto ersetzt wird — sonst
 * bliebe die alte Datei als personenbezogenes Material im Volume liegen.
 *
 * Eine fehlende Datei ist kein Fehler: Der Aufrufer soll nicht jedes Mal selbst
 * prüfen müssen, ob noch etwas da ist.
 *
 * @throws {InvalidProofPathError} bei einem Pfad, der nicht in das Verzeichnis gehört.
 */
export async function deleteProof(objectPath: string): Promise<void> {
  const absolute = resolveObjectPath(objectPath);

  try {
    await unlink(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}
