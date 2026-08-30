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
 * Speichert ein Beweisfoto unter dem Präfix des Nutzers.
 *
 * @returns Objektpfad relativ zum proofs-Verzeichnis. Der gehört in
 *          `verified_plates.proof_image_url`.
 * @throws {UnsupportedProofTypeError} bei einem nicht erlaubten Bildformat.
 */
export async function saveProof(userId: string, plateId: string, file: File): Promise<string> {
  // Die Endung kommt aus dem Content-Type, nie aus dem übermittelten
  // Dateinamen — der stammt vom Client und ist frei wählbar.
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    throw new UnsupportedProofTypeError();
  }

  const objectPath = `${userId}/${plateId}-${Date.now()}.${extension}`;
  const absolute = resolveObjectPath(objectPath);

  await mkdir(join(proofsRoot(), userId), { recursive: true });
  await writeFile(absolute, Buffer.from(await file.arrayBuffer()));

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
