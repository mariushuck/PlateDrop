import "server-only";
import { withAnon, withUser } from "./context";
import type { Message, OpenReport, PendingVerification, VerifiedPlate } from "./types";

/** SQLSTATE 23505 – unique_violation. */
const UNIQUE_VIOLATION = "23505";
/** Unique-Index: ein Nutzer beansprucht dasselbe Kennzeichen nur einmal gleichzeitig (0011). */
const OPEN_CLAIM_UNIQUE_INDEX = "verified_plates_one_open_per_user";
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

/** Der Nutzer hat dieses Kennzeichen bereits beansprucht. */
export class PlateAlreadyClaimedError extends Error {
  constructor() {
    super("Sie haben dieses Kennzeichen bereits beansprucht.");
    this.name = "PlateAlreadyClaimedError";
  }
}

/** Höchstzahl offener Claims je Nutzer – bremst massenhaftes Beanspruchen. */
export const MAX_OPEN_CLAIMS = 3;

export class TooManyOpenClaimsError extends Error {
  constructor() {
    super(`Höchstens ${MAX_OPEN_CLAIMS} Kennzeichen können gleichzeitig auf Prüfung warten.`);
    this.name = "TooManyOpenClaimsError";
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

/**
 * Nachrichten an die verifizierten Kennzeichen des Nutzers, neueste zuerst –
 * ab 30 Tage vor dem Anspruch (`app.message_read_since`, Migration 0009).
 * Die Policy setzt dieselbe Grenze durch; der Filter hier ist die zweite Ebene.
 */
export function listMessagesForUser(userId: string): Promise<Message[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<Message>(
      `SELECT m.id, m.plate_number, m.message_text, m.created_at
         FROM messages m
         JOIN verified_plates vp ON vp.plate_number = m.plate_number
        WHERE vp.user_id = $1
          AND vp.is_verified = true
          AND m.created_at >= app.message_read_since(vp.created_at)
          AND m.hidden_at IS NULL
        ORDER BY m.created_at DESC`,
      [userId],
    );
    return rows;
  });
}

/**
 * Legt einen Kennzeichen-Claim an. Immer unverifiziert und `pending` — die
 * Freigabe erfolgt ausschließlich durch einen Admin. Fremde Claims auf dasselbe
 * Kennzeichen hindern nicht (0011); entschieden wird bei der Freigabe.
 *
 * `makeVerificationCode` wird pro Versuch aufgerufen: kollidiert der erzeugte
 * Code mit einem bestehenden (astronomisch selten), wird bis zu fünfmal neu
 * gewürfelt.
 *
 * @throws {PlateAlreadyClaimedError} wenn der Nutzer es schon beansprucht hat.
 * @throws {TooManyOpenClaimsError} bei mehr als {@link MAX_OPEN_CLAIMS} offenen Claims.
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
        // shortcut: zwei gleichzeitige Claims können das Limit um eins überschreiten; harmlos.
        const open = await client.query(
          "SELECT 1 FROM verified_plates WHERE user_id = $1 AND verification_status = 'pending'",
          [userId],
        );
        if ((open.rowCount ?? 0) >= MAX_OPEN_CLAIMS) throw new TooManyOpenClaimsError();

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
        // Eigener Claim schon vorhanden. `undefined` (kein Constraint-Name im
        // Fehler) fällt bewusst hierher – so wie vor 0006.
        if (constraint === OPEN_CLAIM_UNIQUE_INDEX || constraint === undefined) {
          throw new PlateAlreadyClaimedError();
        }
      }
      throw error;
    }
  }
}

/**
 * Blendet eine Nachricht für ihren Empfänger aus. Der Inhalt bleibt für eine
 * Meldung erhalten, bis die Löschfrist greift.
 *
 * Der Filter über `verified_plates` ist die zweite Ebene neben der Policy
 * `messages_update_hide_own` (0012).
 */
export function hideMessage(userId: string, messageId: string): Promise<boolean> {
  return withUser(userId, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE messages m SET hidden_at = now()
        WHERE m.id = $1
          AND EXISTS (
            SELECT 1 FROM verified_plates vp
             WHERE vp.user_id = $2 AND vp.plate_number = m.plate_number AND vp.is_verified
               AND m.created_at >= app.message_read_since(vp.created_at)
          )`,
      [messageId, userId],
    );
    return (rowCount ?? 0) > 0;
  });
}

/**
 * Meldet eine Nachricht an den Admin und blendet sie für den Melder aus.
 * Wiederholtes Melden derselben Nachricht ändert nichts.
 *
 * @returns `false`, wenn der Nutzer die Nachricht nicht lesen darf.
 */
export function reportMessage(userId: string, messageId: string, reason: string): Promise<boolean> {
  return withUser(userId, async (client) => {
    const hidden = await client.query(
      `UPDATE messages m SET hidden_at = coalesce(m.hidden_at, now())
        WHERE m.id = $1
          AND EXISTS (
            SELECT 1 FROM verified_plates vp
             WHERE vp.user_id = $2 AND vp.plate_number = m.plate_number AND vp.is_verified
               AND m.created_at >= app.message_read_since(vp.created_at)
          )`,
      [messageId, userId],
    );
    if ((hidden.rowCount ?? 0) === 0) return false;

    await client.query(
      `INSERT INTO message_reports (message_id, reporter_id, reason) VALUES ($1, $2, $3)
       ON CONFLICT ON CONSTRAINT message_reports_once DO NOTHING`,
      [messageId, userId, reason],
    );
    return true;
  });
}

/**
 * Pausiert die Benachrichtigungen für ein eigenes Kennzeichen bis `until`
 * (`null` hebt die Pause auf). Läuft über `app.set_plate_pause`, die nur die
 * eigene Zeile und nur diese Spalte ändert (0012).
 */
export function setPlatePause(
  userId: string,
  plateId: string,
  until: Date | null,
): Promise<boolean> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{ ok: boolean }>(
      "SELECT app.set_plate_pause($1, $2) AS ok",
      [plateId, until],
    );
    return rows[0].ok;
  });
}

export interface UserDataExport {
  plates: Array<{
    plate_number: string;
    verification_status: string;
    is_verified: boolean;
    created_at: Date;
  }>;
  messages: Array<{ plate_number: string; message_text: string; created_at: Date }>;
}

/**
 * Sammelt die personenbezogenen Daten des Nutzers für eine Auskunft/Kopie
 * nach Art. 15/20 DSGVO: seine Kennzeichen und die Nachrichten an seine
 * VERIFIZIERTEN Kennzeichen, im selben Lesefenster wie das Dashboard. Die Kontostammdaten (E-Mail, Anlage) legt der
 * Aufrufer aus der Session dazu.
 */
export function exportUserData(userId: string): Promise<UserDataExport> {
  return withUser(userId, async (client) => {
    const plates = await client.query<UserDataExport["plates"][number]>(
      `SELECT plate_number, verification_status, is_verified, created_at
         FROM verified_plates
        WHERE user_id = $1
        ORDER BY created_at`,
      [userId],
    );
    const messages = await client.query<UserDataExport["messages"][number]>(
      `SELECT m.plate_number, m.message_text, m.created_at
         FROM messages m
         JOIN verified_plates vp ON vp.plate_number = m.plate_number
        WHERE vp.user_id = $1
          AND vp.is_verified = true
          AND m.created_at >= app.message_read_since(vp.created_at)
        ORDER BY m.created_at`,
      [userId],
    );
    return { plates: plates.rows, messages: messages.rows };
  });
}

/**
 * Gehört dieses Kennzeichen dem Nutzer? Vorabprüfung, damit für ein fremdes
 * `plateId` gar keine Datei geschrieben wird. `setProofPath` filtert danach
 * ohnehin noch einmal über `user_id`.
 */
export function plateBelongsToUser(userId: string, plateId: string): Promise<boolean> {
  return withUser(userId, async (client) => {
    const { rowCount } = await client.query(
      "SELECT 1 FROM verified_plates WHERE id = $1 AND user_id = $2",
      [plateId, userId],
    );
    return (rowCount ?? 0) > 0;
  });
}

/**
 * Entfernt ein eigenes Kennzeichen – Tippfehler, verkauftes Auto. Danach liest
 * der Nutzer keine Nachrichten mehr daran, und andere können es beanspruchen.
 *
 * @returns den hinterlegten Fotopfad, damit der Aufrufer die Datei löscht.
 */
export function deletePlate(
  userId: string,
  plateId: string,
): Promise<{ deleted: boolean; proofPath: string | null }> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{ proof_image_url: string | null }>(
      "DELETE FROM verified_plates WHERE id = $1 AND user_id = $2 RETURNING proof_image_url",
      [plateId, userId],
    );
    return rows.length > 0
      ? { deleted: true, proofPath: rows[0].proof_image_url }
      : { deleted: false, proofPath: null };
  });
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
 * Darf der Nutzer dieses Beweisfoto sehen? Ein Halter sieht nur seine eigene
 * Zeile, ein Admin jede — findet die Abfrage nichts, ist der Zugriff nicht
 * erlaubt.
 *
 * Der `user_id`/`is_admin`-Filter im SQL ist bewusst redundant zu den
 * Policies: weder ein vergessener Filter noch eine fehlerhafte Policy allein
 * darf ein fremdes Foto freigeben.
 */
export function canReadProof(userId: string, objectPath: string): Promise<boolean> {
  return withUser(userId, async (client) => {
    const { rowCount } = await client.query(
      `SELECT 1 FROM verified_plates
        WHERE proof_image_url = $1
          AND (user_id = $2 OR app.is_admin())`,
      [objectPath, userId],
    );
    return (rowCount ?? 0) > 0;
  });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/**
 * Offene Verifizierungen, die tatsächlich prüfbar sind – also nur solche mit
 * hochgeladenem Beweisfoto.
 *
 * Drei Schichten: die Admin-Prüfung in der Server Action, die RLS-Policy
 * `verified_plates_select_admin` und der `app.is_admin()`-Filter hier. Für
 * einen Nicht-Admin liefert die Abfrage in jedem Fall eine leere Liste.
 */
export function listPendingVerifications(userId: string): Promise<PendingVerification[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<PendingVerification>(
      `SELECT vp.*,
              EXISTS (
                SELECT 1 FROM verified_plates holder
                 WHERE holder.plate_number = vp.plate_number
                   AND holder.verification_status = 'approved'
              ) AS has_approved_holder
         FROM verified_plates vp
        WHERE app.is_admin()
          AND vp.verification_status = 'pending'
          AND vp.proof_image_url IS NOT NULL
        ORDER BY vp.created_at ASC`,
    );
    return rows;
  });
}

/**
 * Offene Meldungen samt gemeldeter Nachricht, älteste zuerst. Ein Admin sieht
 * über `messages_select_reported_admin` nur gemeldete Nachrichten.
 */
export function listOpenReports(userId: string): Promise<OpenReport[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<OpenReport>(
      `SELECT r.id, r.reason, r.created_at, m.id AS message_id, m.plate_number, m.message_text,
              m.created_at AS message_created_at
         FROM message_reports r
         JOIN messages m ON m.id = r.message_id
        WHERE app.is_admin() AND r.resolved_at IS NULL
        ORDER BY r.created_at ASC`,
    );
    return rows;
  });
}

/** Schließt eine Meldung, ohne die Nachricht zu löschen. */
export function resolveReport(userId: string, reportId: string): Promise<boolean> {
  return withUser(userId, async (client) => {
    const { rowCount } = await client.query(
      "UPDATE message_reports SET resolved_at = now() WHERE id = $1 AND app.is_admin()",
      [reportId],
    );
    return (rowCount ?? 0) > 0;
  });
}

/** Löscht eine gemeldete Nachricht; ihre Meldungen fallen per Kaskade mit weg. */
export function deleteReportedMessage(userId: string, messageId: string): Promise<boolean> {
  return withUser(userId, async (client) => {
    const { rowCount } = await client.query(
      `DELETE FROM messages m
        WHERE m.id = $1 AND app.is_admin()
          AND EXISTS (SELECT 1 FROM message_reports r WHERE r.message_id = m.id)`,
      [messageId],
    );
    return (rowCount ?? 0) > 0;
  });
}

export interface SetPlateVerificationResult {
  /** `false`, wenn der Aufrufer kein Admin ist oder das Kennzeichen nicht existiert. */
  changed: boolean;
  plateNumber: string | null;
  /** Adressen der Halter, die durch die Freigabe abgelöst wurden – sie bekommen eine Mail. */
  supersededEmails: string[];
}

/**
 * Gibt ein Kennzeichen frei oder lehnt es ab.
 *
 * Eine Freigabe löst in derselben Transaktion die Konkurrenz auf: ein bisher
 * freigegebener Halter desselben Kennzeichens wird `superseded` (zuerst, sonst
 * greift `verified_plates_one_approved`), andere offene Claims `rejected`.
 *
 * Der `app.is_admin()`-Filter in jedem Statement ist bewusst redundant zur
 * RLS-Policy `verified_plates_update_admin` und zur Prüfung in der Server Action.
 */
export function setPlateVerification(
  userId: string,
  plateId: string,
  approved: boolean,
): Promise<SetPlateVerificationResult> {
  return withUser(userId, async (client) => {
    const target = await client.query<{ plate_number: string }>(
      "SELECT plate_number FROM verified_plates WHERE id = $1 AND app.is_admin()",
      [plateId],
    );
    if (target.rows.length === 0)
      return { changed: false, plateNumber: null, supersededEmails: [] };
    const plateNumber = target.rows[0].plate_number;

    if (!approved) {
      await client.query(
        `UPDATE verified_plates SET is_verified = false, verification_status = 'rejected'
          WHERE id = $1 AND app.is_admin()`,
        [plateId],
      );
      return { changed: true, plateNumber, supersededEmails: [] };
    }

    const superseded = await client.query<{ email: string }>(
      `WITH abgeloest AS (
         UPDATE verified_plates SET is_verified = false, verification_status = 'superseded'
          WHERE plate_number = $1 AND id <> $2 AND verification_status = 'approved'
            AND app.is_admin()
         RETURNING user_id
       )
       SELECT u.email FROM abgeloest JOIN users u ON u.id = abgeloest.user_id`,
      [plateNumber, plateId],
    );
    await client.query(
      `UPDATE verified_plates SET verification_status = 'rejected'
        WHERE plate_number = $1 AND id <> $2 AND verification_status = 'pending'
          AND app.is_admin()`,
      [plateNumber, plateId],
    );
    await client.query(
      `UPDATE verified_plates SET is_verified = true, verification_status = 'approved'
        WHERE id = $1 AND app.is_admin()`,
      [plateId],
    );
    return { changed: true, plateNumber, supersededEmails: superseded.rows.map((r) => r.email) };
  });
}
