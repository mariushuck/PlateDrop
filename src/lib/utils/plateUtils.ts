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
 */
const DISTRICT = /^[A-ZÄÖÜ]{1,3}$/;
const LETTERS = /^[A-Z]{1,2}$/;
const NUMBER = /^[1-9]\d{0,3}[EH]?$/;
const CANONICAL = /^[A-ZÄÖÜ]{1,3}-[A-Z]{1,2}-[1-9]\d{0,3}[EH]?$/;

export type ParsedPlate =
  | { ok: true; plate: string }
  | { ok: false; reason: "invalid" | "ambiguous" };

const INVALID: ParsedPlate = { ok: false, reason: "invalid" };

function build(district: string, letters: string, number: string): ParsedPlate {
  if (DISTRICT.test(district) && LETTERS.test(letters) && NUMBER.test(number)) {
    return { ok: true, plate: `${district}-${letters}-${number}` };
  }
  return INVALID;
}

/**
 * Teilt einen Buchstabenblock ohne Trennzeichen in Ortskürzel und Buchstaben.
 * Gibt es genau eine gültige Aufteilung, wird sie übernommen; bei mehreren ist
 * die Eingabe mehrdeutig.
 */
function splitLetterBlock(block: string, number: string): ParsedPlate {
  const candidates: string[] = [];
  for (let i = 1; i <= 3 && i < block.length; i++) {
    const result = build(block.slice(0, i), block.slice(i), number);
    if (result.ok) candidates.push(result.plate);
  }
  if (candidates.length === 1) return { ok: true, plate: candidates[0] };
  return candidates.length > 1 ? { ok: false, reason: "ambiguous" } : INVALID;
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
export function plateErrorMessage(reason: "invalid" | "ambiguous"): string {
  return reason === "ambiguous"
    ? "Bitte Ortskürzel und Buchstaben trennen, z. B. KA-AB 1234 oder K-AB 1234."
    : "Ungültiges deutsches Kennzeichen. Beispiel: KA-AB-1234";
}
