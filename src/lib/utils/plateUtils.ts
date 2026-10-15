/**
 * Deutsche Kennzeichen bestehen aus Ortskürzel (1–3 Buchstaben, Umlaute
 * möglich), Erkennungsbuchstaben (1–2) und einer Zahl (1–4 Ziffern, ohne
 * führende Null), optional gefolgt von E (Elektro) oder H (historisch).
 *
 * Gespeichert wird die kanonische Form `KA-AB-1234`. Die Trennung zwischen
 * Ortskürzel und Buchstaben ist dabei wesentlich: ohne sie wären "K-AB 1234"
 * (Köln) und "KA-B 1234" (Karlsruhe) derselbe Wert, und wer eines der beiden
 * verifiziert, läse die Nachrichten an das andere.
 *
 * Dasselbe Muster prüft ein CHECK-Constraint auf `verified_plates` und
 * `messages` (db/migrations/0008_plate_format.sql).
 *
 * Zusätzlich muss das Ortskürzel amtlich sein: `districts.json` enthält alle
 * vergebenen und auslaufenden Unterscheidungszeichen (FZV Anlage 1, ohne die
 * Sonderzeichen aus Anlage 2 wie BP, THW, X, Y). Quelle: KBA-Merkblatt
 * „Kfz-Kennzeichen und auslaufende Kennzeichen in Deutschland“, abgeglichen mit
 * den Wikipedia-Listen der gültigen und nicht mehr ausgegebenen Kennzeichen,
 * Stand Oktober 2026. Neue Kürzel dort ergänzen (docs/admin.md, B7).
 */
import districts from "./districts.json";

const DISTRICT = /^[A-ZÄÖÜ]{1,3}$/;
const LETTERS = /^[A-Z]{1,2}$/;
const NUMBER = /^[1-9]\d{0,3}[EH]?$/;
const CANONICAL = /^[A-ZÄÖÜ]{1,3}-[A-Z]{1,2}-[1-9]\d{0,3}[EH]?$/;

/** Beispiel für Platzhalter und Hinweise: XX ist kein Ortskürzel, das Kennzeichen kann es nicht geben. */
export const EXAMPLE_PLATE = "XX-AB-123";

const DISTRICTS: Readonly<Record<string, string>> = districts;

export type PlateCandidate = { plate: string; district: string };

export type ParsedPlate =
  | { ok: true; plate: string }
  | { ok: false; reason: "invalid" | "unknown-district" }
  | { ok: false; reason: "ambiguous"; candidates: PlateCandidate[] };

export type PlateError = Exclude<ParsedPlate, { ok: true }>["reason"];

const INVALID: ParsedPlate = { ok: false, reason: "invalid" };

/** Ortsname zum Kürzel, z. B. „Karlsruhe“ für KA; `undefined` für Unbekanntes. */
export function districtName(code: string): string | undefined {
  return Object.hasOwn(DISTRICTS, code) ? DISTRICTS[code] : undefined;
}

function build(district: string, letters: string, number: string): ParsedPlate {
  if (!(DISTRICT.test(district) && LETTERS.test(letters) && NUMBER.test(number))) return INVALID;
  if (!districtName(district)) return { ok: false, reason: "unknown-district" };
  return { ok: true, plate: `${district}-${letters}-${number}` };
}

/**
 * Teilt einen Buchstabenblock ohne Trennzeichen in Ortskürzel und Buchstaben.
 * Nur amtliche Ortskürzel zählen. Gibt es genau eine Aufteilung, wird sie
 * übernommen; bei mehreren (K-AB / KA-B) muss die Person wählen.
 */
function splitLetterBlock(block: string, number: string): ParsedPlate {
  const candidates: PlateCandidate[] = [];
  for (let i = 1; i <= 3 && i < block.length; i++) {
    const district = block.slice(0, i);
    const result = build(district, block.slice(i), number);
    if (result.ok) candidates.push({ plate: result.plate, district: DISTRICTS[district] });
  }
  if (candidates.length === 1) return { ok: true, plate: candidates[0].plate };
  return candidates.length > 1 ? { ok: false, reason: "ambiguous", candidates } : INVALID;
}

export function parsePlate(input: string): ParsedPlate {
  if (!input || typeof input !== "string") return INVALID;

  // Nur ASCII-Bindestrich und Leerraum trennen. Gedankenstriche u. Ä. bleiben
  // stehen und machen die Eingabe ungültig.
  const parts = input
    .toUpperCase()
    .split(/[-\s]+/)
    .filter(Boolean);

  if (parts.length === 3) return build(parts[0], parts[1], parts[2]);

  if (parts.length === 2) {
    const [first, second] = parts;
    // "KA AB1234": Ortskürzel getrennt, Buchstaben und Zahl zusammen.
    const lettersAndNumber = /^([A-Z]+)(\d.*)$/.exec(second);
    if (lettersAndNumber) return build(first, lettersAndNumber[1], lettersAndNumber[2]);
    // "KAAB 1234": Ortskürzel und Buchstaben zusammen.
    if (/^[A-ZÄÖÜ]+$/.test(first)) return splitLetterBlock(first, second);
    return INVALID;
  }

  if (parts.length === 1) {
    const compact = /^([A-ZÄÖÜ]+)(\d.*)$/.exec(parts[0]);
    return compact ? splitLetterBlock(compact[1], compact[2]) : INVALID;
  }

  return INVALID;
}

/** Kanonische Form oder `""`, wenn die Eingabe ungültig oder mehrdeutig ist. */
export function normalizePlate(plate: string): string {
  const parsed = parsePlate(plate);
  return parsed.ok ? parsed.plate : "";
}

export function validateGermanPlate(plate: string): boolean {
  return parsePlate(plate).ok;
}

/** Liegt der Wert bereits in der gespeicherten Form vor? Altdaten tun das nicht. */
export function isCanonicalPlate(plate: string): boolean {
  return CANONICAL.test(plate);
}

/** Meldung für Formulare und Server Actions. */
export function plateErrorMessage(reason: PlateError): string {
  if (reason === "ambiguous") {
    return "Mehrdeutig: Bitte wähle das Ortskürzel aus oder trenne es mit einem Bindestrich.";
  }
  if (reason === "unknown-district") {
    return "Unbekanntes Ortskürzel. Bitte prüfe die Buchstaben vor dem ersten Bindestrich.";
  }
  return "Ungültiges deutsches Kennzeichen. Aufbau: Ortskürzel – Buchstaben – Zahl.";
}
