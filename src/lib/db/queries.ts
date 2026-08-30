import "server-only";
import { withAnon, withUser } from "./context";
import type { Message, VerifiedPlate } from "./types";

/** SQLSTATE 23505 – unique_violation. */
const UNIQUE_VIOLATION = "23505";
/** Name des UNIQUE-Constraints auf verified_plates.plate_number. */
const PLATE_UNIQUE_CONSTRAINT = "verified_plates_plate_unique";
/** Name des UNIQUE-Constraints auf verified_plates.verification_code. */
const VERIFICATION_CODE_UNIQUE_CONSTRAINT = "verified_plates_verification_code_key";
/** SQLSTATE 23514 – check_violation, ausgelöst vom Kennzeichen-Rate-Limit-Trigger. */
const CHECK_VIOLATION = "23514";

/** Das Kennzeichen hat sein Stundenlimit an Nachrichten erreicht. */
export class PlateRateLimitError extends Error {
  constructor() {
    super("Nachrichtenlimit für dieses Kennzeichen erreicht.");
    this.name = "PlateRateLimitError";
  }
}

/** Das Kennzeichen ist bereits von jemandem beansprucht. */
export class PlateAlreadyClaimedError extends Error {
  constructor() {
    super("Dieses Kennzeichen ist bereits registriert.");
    this.name = "PlateAlreadyClaimedError";
  }
}

function hasSqlState(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === code;
}

function constraintName(error: unknown): string | undefined {
  return typeof error === "object" && error !== null
    ? (error as { constraint?: string }).constraint
    : undefined;
}

// ---------------------------------------------------------------------------
// Öffentlich – ohne angemeldeten Nutzer
// ---------------------------------------------------------------------------

/**
 * Speichert eine anonyme Nachricht. Das Kennzeichen muss bereits normalisiert
 * sein (siehe src/lib/utils/plateUtils.ts).
 *
 * @throws {PlateRateLimitError} wenn der Stunden-Deckel des Kennzeichens greift.
 */
export async function insertMessage(plateNumber: string, messageText: string): Promise<void> {
  try {
    await withAnon((client) =>
      client.query("INSERT INTO messages (plate_number, message_text) VALUES ($1, $2)", [
        plateNumber,
        messageText,
      ]),
    );
  } catch (error) {
    if (hasSqlState(error, CHECK_VIOLATION)) throw new PlateRateLimitError();
    throw error;
  }
}

/**
 * Fragt das Absender-Limit ab und zählt den Versuch mit. `null` steht für einen
 * nicht bestimmbaren Absender — dann greift nur der Deckel je Kennzeichen.
 */
export async function checkMessageRate(ipHash: string | null): Promise<boolean> {
  return withAnon(async (client) => {
    const { rows } = await client.query<{ allowed: boolean }>(
      "SELECT check_message_rate($1) AS allowed",
      [ipHash],
    );
    return rows[0].allowed;
  });
}

// ---------------------------------------------------------------------------
// Angemeldeter Nutzer
// ---------------------------------------------------------------------------

/**
 * Alle Kennzeichen des Nutzers, neueste zuerst.
 *
 * Der `user_id`-Filter ist bewusst redundant: die RLS-Policy schränkt bereits
 * auf eigene Zeilen ein. Beides zusammen heißt, dass weder ein vergessener
 * Filter noch eine fehlerhafte Policy allein zum Datenleck führt.
 */
export function listPlatesForUser(userId: string): Promise<VerifiedPlate[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<VerifiedPlate>(
      "SELECT * FROM verified_plates WHERE user_id = $1 ORDER BY created_at DESC",
      [userId],
    );
    return rows;
  });
}

/** Nachrichten an die verifizierten Kennzeichen des Nutzers, neueste zuerst. */
export function listMessagesForUser(userId: string): Promise<Message[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<Message>(
      `SELECT m.id, m.plate_number, m.message_text, m.created_at
         FROM messages m
         JOIN verified_plates vp ON vp.plate_number = m.plate_number
        WHERE vp.user_id = $1
          AND vp.is_verified = true
        ORDER BY m.created_at DESC`,
      [userId],
    );
    return rows;
  });
}

/**
 * Legt einen Kennzeichen-Claim an. Immer unverifiziert und `pending` — die
 * Freigabe erfolgt ausschließlich durch einen Admin.
 *
 * `makeVerificationCode` wird pro Versuch aufgerufen: kollidiert der erzeugte
 * Code mit einem bestehenden (astronomisch selten), wird bis zu fünfmal neu
 * gewürfelt.
 *
 * @throws {PlateAlreadyClaimedError} wenn das Kennzeichen schon vergeben ist.
 */
export async function claimPlate(
  userId: string,
  plateNumber: string,
  makeVerificationCode: () => string,
): Promise<VerifiedPlate> {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; ; attempt++) {
    try {
      return await withUser(userId, async (client) => {
        const { rows } = await client.query<VerifiedPlate>(
          `INSERT INTO verified_plates
             (user_id, plate_number, is_verified, verification_status, verification_code)
           VALUES ($1, $2, false, 'pending', $3)
           RETURNING *`,
          [userId, plateNumber, makeVerificationCode()],
        );
        return rows[0];
      });
    } catch (error) {
      if (hasSqlState(error, UNIQUE_VIOLATION)) {
        const constraint = constraintName(error);
        // Code-Kollision: begrenzt neu würfeln.
        if (constraint === VERIFICATION_CODE_UNIQUE_CONSTRAINT && attempt < MAX_ATTEMPTS) {
          continue;
        }
        // Kennzeichen schon vergeben. `undefined` (kein Constraint-Name im
        // Fehler) fällt bewusst hierher – so wie vor 0006.
        if (constraint === PLATE_UNIQUE_CONSTRAINT || constraint === undefined) {
          throw new PlateAlreadyClaimedError();
        }
      }
      throw error;
    }
  }
}

export interface SetProofPathResult {
  /** `false`, wenn das Kennzeichen dem Nutzer nicht gehört. */
  updated: boolean;
  /** Bisher hinterlegter Pfad, damit der Aufrufer die alte Datei entfernen kann. */
  previousPath: string | null;
}

/**
 * Hinterlegt den Objektpfad des Beweisfotos und stellt das Kennzeichen zurück
 * in die Warteschlange.
 *
 * Der Rücksprung auf `pending` ist wesentlich: Nach einer Ablehnung steht die
 * Zeile auf `rejected`, und die Admin-Liste zeigt ausschließlich `pending`.
 * Ohne ihn bliebe ein nachgereichtes Foto für den Admin unsichtbar, während die
 * Kennzeichennummer durch den Unique-Constraint weiter belegt wäre.
 */
export function setProofPath(
  userId: string,
  plateId: string,
  objectPath: string,
): Promise<SetProofPathResult> {
  return withUser(userId, async (client) => {
    // RETURNING liefert nur die neue Zeile, deshalb den alten Pfad vorab per CTE
    // sichern – der Aufrufer braucht ihn, um die ersetzte Datei zu löschen.
    const { rows } = await client.query<{ previous_path: string | null }>(
      `WITH vorher AS (
         SELECT proof_image_url FROM verified_plates WHERE id = $2 AND user_id = $3
       )
       UPDATE verified_plates
          SET proof_image_url = $1,
              verification_status = 'pending'
        WHERE id = $2 AND user_id = $3
       RETURNING (SELECT proof_image_url FROM vorher) AS previous_path`,
      [objectPath, plateId, userId],
    );

    return rows.length > 0
      ? { updated: true, previousPath: rows[0].previous_path }
      : { updated: false, previousPath: null };
  });
}

/**
 * Darf der Nutzer dieses Beweisfoto sehen? Die Antwort kommt aus den Policies:
 * ein Halter sieht nur seine eigene Zeile, ein Admin jede — findet die Abfrage
 * nichts, ist der Zugriff nicht erlaubt.
 */
export function canReadProof(userId: string, objectPath: string): Promise<boolean> {
  return withUser(userId, async (client) => {
    const { rowCount } = await client.query(
      "SELECT 1 FROM verified_plates WHERE proof_image_url = $1",
      [objectPath],
    );
    return (rowCount ?? 0) > 0;
  });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/**
 * Offene Verifizierungen, die tatsächlich prüfbar sind – also nur solche mit
 * hochgeladenem Beweisfoto. Für Nicht-Admins liefert die RLS-Policy eine leere
 * Liste; die Admin-Prüfung in der Server Action bleibt trotzdem die erste
 * Verteidigungslinie.
 */
export function listPendingVerifications(userId: string): Promise<VerifiedPlate[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<VerifiedPlate>(
      `SELECT * FROM verified_plates
        WHERE verification_status = 'pending'
          AND proof_image_url IS NOT NULL
        ORDER BY created_at ASC`,
    );
    return rows;
  });
}

/**
 * Gibt ein Kennzeichen frei oder lehnt es ab.
 *
 * @returns `false`, wenn nichts geändert wurde – etwa weil der Aufrufer kein
 *          Admin ist oder das Kennzeichen nicht existiert.
 */
export function setPlateVerification(
  userId: string,
  plateId: string,
  approved: boolean,
): Promise<boolean> {
  return withUser(userId, async (client) => {
    const result = await client.query(
      `UPDATE verified_plates
          SET is_verified = $1,
              verification_status = $2
        WHERE id = $3`,
      [approved, approved ? "approved" : "rejected", plateId],
    );
    return (result.rowCount ?? 0) > 0;
  });
}
