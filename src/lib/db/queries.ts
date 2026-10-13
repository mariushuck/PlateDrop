import "server-only";
import { withAnon, withUser } from "./context";
import type {
  Membership,
  Message,
  NotificationSettings,
  OpenReport,
  Organization,
  OrgMember,
  OrgPlate,
  OrgSite,
  OrgWeeklyStat,
  PendingVerification,
  SiteInfo,
  VerifiedPlate,
} from "./types";

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

/**
 * Zweite Ebene zur Lesebedingung `app.can_read_message()` (0014): `vp` ist ein
 * freigegebenes Kennzeichen des Nutzers, `m` die Nachricht. Gleiches Kennzeichen,
 * Lesefenster, gleicher Bereich (öffentlich oder dieselbe Organisation) und bei
 * Standort-Nachrichten aktive Mitgliedschaft am Standort. Jede Query, die
 * Nachrichten für einen Empfänger anfasst, kombiniert das mit `vp.user_id = $n`.
 */
const RECIPIENT_MATCH = `vp.plate_number = m.plate_number
            AND vp.is_verified = true
            AND m.created_at >= app.message_read_since(vp.created_at)
            AND vp.org_id IS NOT DISTINCT FROM m.org_id
            AND (m.site_id IS NULL OR EXISTS (
                  SELECT 1 FROM site_members sm
                   WHERE sm.site_id = m.site_id AND sm.user_id = vp.user_id
                     AND sm.status = 'active'))`;

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
 * Speichert eine anonyme Nachricht aus dem Katalog (src/lib/messages/catalog.ts).
 * Das Kennzeichen muss bereits normalisiert sein (src/lib/utils/plateUtils.ts).
 * Freitext gibt es für anonyme Absender nicht (Policy, 0013).
 *
 * @throws {PlateRateLimitError} wenn der Stunden-Deckel des Kennzeichens greift.
 */
export async function insertMessage(plateNumber: string, messageType: string): Promise<void> {
  try {
    await withAnon((client) =>
      client.query("INSERT INTO messages (plate_number, message_type) VALUES ($1, $2)", [
        plateNumber,
        messageType,
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
      `SELECT vp.*, o.name AS org_name
         FROM verified_plates vp
         LEFT JOIN organizations o ON o.id = vp.org_id
        WHERE vp.user_id = $1
        ORDER BY vp.created_at DESC`,
      [userId],
    );
    return rows;
  });
}

/**
 * Nachrichten an die verifizierten Kennzeichen des Nutzers, neueste zuerst.
 * `plate_id` ordnet jede Nachricht genau einer Kennzeichen-Zeile zu: dieselbe
 * Nummer kann öffentlich und in einer Organisation registriert sein. Der
 * Absendername kommt nur, wenn die Organisation ihn zeigt (0014).
 */
export function listMessagesForUser(userId: string): Promise<Message[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<Message>(
      `SELECT m.id, m.plate_number, m.message_type, m.message_text, m.created_at, m.read_at,
              vp.id AS plate_id, os.name AS site_name,
              app.message_sender_name(m.id) AS sender_name
         FROM messages m
         JOIN verified_plates vp ON ${RECIPIENT_MATCH}
         LEFT JOIN org_sites os ON os.id = m.site_id
        WHERE vp.user_id = $1
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
  /** Organisation (0014): kein Foto, keine Code-Freigabe – der Org-Admin entscheidet. */
  orgId: string | null = null,
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

        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO verified_plates
             (user_id, plate_number, is_verified, verification_status, verification_code, org_id)
           VALUES ($1, $2, false, 'pending', $3, $4)
           RETURNING id`,
          [userId, plateNumber, orgId ? null : makeVerificationCode(), orgId],
        );
        // Neu lesen: ein Trigger gibt Kennzeichen von der Fuhrparkliste sofort frei.
        const fresh = await client.query<VerifiedPlate>(
          "SELECT * FROM verified_plates WHERE id = $1 AND user_id = $2",
          [rows[0].id, userId],
        );
        return fresh.rows[0];
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
          AND EXISTS (SELECT 1 FROM verified_plates vp WHERE vp.user_id = $2 AND ${RECIPIENT_MATCH})`,
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
          AND EXISTS (SELECT 1 FROM verified_plates vp WHERE vp.user_id = $2 AND ${RECIPIENT_MATCH})`,
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
 * Markiert Nachrichten als gelesen, sobald der Empfänger sie gesehen hat
 * (Messgröße „Zeit bis zur Reaktion"). Bereits gelesene bleiben unverändert.
 */
export function markMessagesRead(userId: string, messageIds: string[]): Promise<void> {
  return withUser(userId, async (client) => {
    await client.query(
      `UPDATE messages m SET read_at = now()
        WHERE m.id = ANY($1::uuid[]) AND m.read_at IS NULL
          AND EXISTS (SELECT 1 FROM verified_plates vp WHERE vp.user_id = $2 AND ${RECIPIENT_MATCH})`,
      [messageIds, userId],
    );
  });
}

/** Benachrichtigungs-Einstellungen; ohne gespeicherte Zeile gelten die Standards. */
export function getNotificationSettings(userId: string): Promise<NotificationSettings> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<NotificationSettings>(
      `SELECT email_enabled, quiet_start, quiet_end
         FROM notification_settings WHERE user_id = $1`,
      [userId],
    );
    return rows[0] ?? { email_enabled: true, quiet_start: null, quiet_end: null };
  });
}

export function saveNotificationSettings(
  userId: string,
  settings: NotificationSettings,
): Promise<void> {
  return withUser(userId, async (client) => {
    await client.query(
      `INSERT INTO notification_settings (user_id, email_enabled, quiet_start, quiet_end)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
         SET email_enabled = EXCLUDED.email_enabled,
             quiet_start = EXCLUDED.quiet_start,
             quiet_end = EXCLUDED.quiet_end,
             updated_at = now()`,
      [userId, settings.email_enabled, settings.quiet_start, settings.quiet_end],
    );
  });
}

/**
 * Alter des ältesten fälligen, noch nicht versendeten Outbox-Eintrags in
 * Sekunden – für den Healthcheck. Die Outbox selbst bleibt für die App-Rolle
 * gesperrt; die Funktion gibt nur diese Zahl heraus.
 */
export function outboxLagSeconds(): Promise<number> {
  return withAnon(async (client) => {
    const { rows } = await client.query<{ lag: number }>("SELECT app.outbox_lag_seconds() AS lag");
    return Number(rows[0].lag);
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
    organization: string | null;
  }>;
  memberships: Array<{
    site: string;
    organization: string | null;
    status: string;
    created_at: Date;
  }>;
  messages: Array<{
    plate_number: string;
    message_type: string | null;
    message_text: string | null;
    created_at: Date;
  }>;
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
      `SELECT vp.plate_number, vp.verification_status, vp.is_verified, vp.created_at,
              o.name AS organization
         FROM verified_plates vp
         LEFT JOIN organizations o ON o.id = vp.org_id
        WHERE vp.user_id = $1
        ORDER BY vp.created_at`,
      [userId],
    );
    const messages = await client.query<UserDataExport["messages"][number]>(
      `SELECT m.plate_number, m.message_type, m.message_text, m.created_at
         FROM messages m
         JOIN verified_plates vp ON ${RECIPIENT_MATCH}
        WHERE vp.user_id = $1
        ORDER BY m.created_at`,
      [userId],
    );
    const memberships = await client.query<UserDataExport["memberships"][number]>(
      `SELECT s.name AS site, o.name AS organization, sm.status, sm.created_at
         FROM site_members sm
         JOIN org_sites s ON s.id = sm.site_id
         LEFT JOIN organizations o ON o.id = s.org_id
        WHERE sm.user_id = $1
        ORDER BY sm.created_at`,
      [userId],
    );
    return { plates: plates.rows, messages: messages.rows, memberships: memberships.rows };
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
                   AND holder.org_id IS NULL
                   AND holder.verification_status = 'approved'
              ) AS has_approved_holder
         FROM verified_plates vp
        WHERE app.is_admin()
          AND vp.org_id IS NULL
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
      `SELECT r.id, r.reason, r.created_at, m.id AS message_id, m.plate_number, m.message_type, m.message_text,
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
 * Wer darf ein Kennzeichen freigeben? Plattform-Admins jedes, Org-Admins nur
 * die ihrer Organisation (0014). Steht in jedem Statement – redundant zu den
 * Policies `verified_plates_update_admin` / `_update_org_admin`.
 */
const MAY_DECIDE = "(app.is_admin() OR (org_id IS NOT NULL AND app.is_org_admin(org_id)))";

/**
 * Gibt ein Kennzeichen frei oder lehnt es ab.
 *
 * Eine Freigabe löst in derselben Transaktion die Konkurrenz auf – im selben
 * Bereich (öffentlich bzw. dieselbe Organisation): ein bisher freigegebener
 * Halter wird `superseded` (zuerst, sonst greift `verified_plates_one_approved`),
 * andere offene Claims `rejected`.
 */
export function setPlateVerification(
  userId: string,
  plateId: string,
  approved: boolean,
): Promise<SetPlateVerificationResult> {
  return withUser(userId, async (client) => {
    const target = await client.query<{ plate_number: string; org_id: string | null }>(
      `SELECT plate_number, org_id FROM verified_plates WHERE id = $1 AND ${MAY_DECIDE}`,
      [plateId],
    );
    if (target.rows.length === 0)
      return { changed: false, plateNumber: null, supersededEmails: [] };
    const { plate_number: plateNumber, org_id: orgId } = target.rows[0];

    if (!approved) {
      await client.query(
        `UPDATE verified_plates SET is_verified = false, verification_status = 'rejected'
          WHERE id = $1 AND ${MAY_DECIDE}`,
        [plateId],
      );
      return { changed: true, plateNumber, supersededEmails: [] };
    }

    const superseded = await client.query<{ email: string }>(
      `WITH abgeloest AS (
         UPDATE verified_plates SET is_verified = false, verification_status = 'superseded'
          WHERE plate_number = $1 AND org_id IS NOT DISTINCT FROM $3 AND id <> $2
            AND verification_status = 'approved' AND ${MAY_DECIDE}
         RETURNING user_id
       )
       SELECT u.email FROM abgeloest JOIN users u ON u.id = abgeloest.user_id`,
      [plateNumber, plateId, orgId],
    );
    await client.query(
      `UPDATE verified_plates SET verification_status = 'rejected'
        WHERE plate_number = $1 AND org_id IS NOT DISTINCT FROM $3 AND id <> $2
          AND verification_status = 'pending' AND ${MAY_DECIDE}`,
      [plateNumber, plateId, orgId],
    );
    await client.query(
      `UPDATE verified_plates SET is_verified = true, verification_status = 'approved'
        WHERE id = $1 AND ${MAY_DECIDE}`,
      [plateId],
    );
    return { changed: true, plateNumber, supersededEmails: superseded.rows.map((r) => r.email) };
  });
}

// ---------------------------------------------------------------------------
// Organisationen (0014)
// ---------------------------------------------------------------------------
// Autorisierung wie überall doppelt: die Policies aus 0014 und hier der
// explizite `app.is_org_admin()`- bzw. `user_id`-Filter.

/** Standort zu einem QR-Token; `null` für unbekannte Token. Öffentlich aufrufbar. */
export function siteByToken(token: string): Promise<SiteInfo | null> {
  return withAnon(async (client) => {
    const { rows } = await client.query<SiteInfo>(
      `SELECT site_id AS "siteId", site_name AS "siteName", org_id AS "orgId",
              org_name AS "orgName", org_slug AS "orgSlug", allow_free_text AS "allowFreeText",
              show_sender AS "showSender", active
         FROM app.site_by_token($1)`,
      [token],
    );
    return rows[0] ?? null;
  });
}

/**
 * Nachricht über den Standort-QR. Anonym (`senderId` null) nur mit Typ; ein
 * angemeldeter Absender wird eingetragen und darf – wenn die Organisation es
 * erlaubt und er am Standort aktiv ist – Freitext schicken (Policy, 0014).
 *
 * @throws {PlateRateLimitError} wenn der Stunden-Deckel des Kennzeichens greift.
 */
export async function insertSiteMessage(
  senderId: string | null,
  message: {
    plate: string;
    type: string | null;
    text: string | null;
    orgId: string;
    siteId: string;
  },
): Promise<void> {
  try {
    await withUser(senderId, (client) =>
      client.query(
        `INSERT INTO messages (plate_number, message_type, message_text, org_id, site_id, sender_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [message.plate, message.type, message.text, message.orgId, message.siteId, senderId],
      ),
    );
  } catch (error) {
    if (hasSqlState(error, CHECK_VIOLATION)) throw new PlateRateLimitError();
    throw error;
  }
}

/** Status der eigenen Mitgliedschaft an einem Standort oder `null`. */
export function membershipStatus(userId: string, siteId: string): Promise<string | null> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{ status: string }>(
      "SELECT status FROM site_members WHERE site_id = $1 AND user_id = $2",
      [siteId, userId],
    );
    return rows[0]?.status ?? null;
  });
}

/** Beitritt beantragen; ein bestehender Antrag oder eine Mitgliedschaft bleibt unverändert. */
export function requestSiteMembership(userId: string, siteId: string): Promise<void> {
  return withUser(userId, async (client) => {
    await client.query(
      `INSERT INTO site_members (site_id, user_id) VALUES ($1, $2)
       ON CONFLICT (site_id, user_id) DO NOTHING`,
      [siteId, userId],
    );
  });
}

/** Eigene Mitgliedschaft beenden. Kennzeichen der Organisation verfallen per Trigger. */
export function leaveSite(userId: string, siteId: string): Promise<boolean> {
  return withUser(userId, async (client) => {
    const { rowCount } = await client.query(
      "DELETE FROM site_members WHERE site_id = $1 AND user_id = $2",
      [siteId, userId],
    );
    return (rowCount ?? 0) > 0;
  });
}

/**
 * Eigene Mitgliedschaften. Den Namen der Organisation sieht erst ein aktives
 * Mitglied (Policy `organizations_select_member`); bei offenen Anträgen ist er `null`.
 */
export function listMyMemberships(userId: string): Promise<Membership[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<Membership>(
      `SELECT sm.site_id, s.name AS site_name, s.org_id, o.name AS org_name, sm.status
         FROM site_members sm
         JOIN org_sites s ON s.id = sm.site_id
         LEFT JOIN organizations o ON o.id = s.org_id
        WHERE sm.user_id = $1
        ORDER BY s.name`,
      [userId],
    );
    return rows;
  });
}

/** Organisationen, die der Nutzer verwaltet. */
export function listMyAdminOrgs(userId: string): Promise<Array<{ name: string; slug: string }>> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{ name: string; slug: string }>(
      `SELECT o.name, o.slug FROM organizations o
         JOIN org_admins a ON a.org_id = o.id
        WHERE a.user_id = $1
        ORDER BY o.name`,
      [userId],
    );
    return rows;
  });
}

/** Organisation per Slug – nur für ihre Admins, sonst `null`. */
export function orgForAdmin(userId: string, slug: string): Promise<Organization | null> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<Organization>(
      `SELECT id, name, slug, show_sender, allow_free_text FROM organizations
        WHERE slug = $1 AND app.is_org_admin(id)`,
      [slug],
    );
    return rows[0] ?? null;
  });
}

export function listOrgSites(userId: string, orgId: string): Promise<OrgSite[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<OrgSite>(
      `SELECT id, name, token, disabled_at IS NOT NULL AS disabled FROM org_sites
        WHERE org_id = $1 AND app.is_org_admin(org_id)
        ORDER BY created_at`,
      [orgId],
    );
    return rows;
  });
}

/** Legt einen Standort an. @returns die ID. */
export function createSite(
  userId: string,
  orgId: string,
  name: string,
  token: string,
): Promise<string> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO org_sites (org_id, name, token) SELECT $1, $2, $3 WHERE app.is_org_admin($1)
       RETURNING id`,
      [orgId, name, token],
    );
    if (!rows[0]) throw new Error("Keine Berechtigung für diese Organisation.");
    return rows[0].id;
  });
}

export function setSiteDisabled(
  userId: string,
  siteId: string,
  disabled: boolean,
): Promise<boolean> {
  return withUser(userId, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE org_sites SET disabled_at = CASE WHEN $2 THEN now() END
        WHERE id = $1 AND app.is_org_admin(org_id)`,
      [siteId, disabled],
    );
    return (rowCount ?? 0) > 0;
  });
}

/** Neues Token, z. B. wenn ein Aushang missbraucht wird; alte QR-Codes werden ungültig. */
export function renewSiteToken(userId: string, siteId: string, token: string): Promise<boolean> {
  return withUser(userId, async (client) => {
    const { rowCount } = await client.query(
      "UPDATE org_sites SET token = $2 WHERE id = $1 AND app.is_org_admin(org_id)",
      [siteId, token],
    );
    return (rowCount ?? 0) > 0;
  });
}

/** Mitgliedschaften aller Standorte, mit E-Mail und Anzeigename – nur für Org-Admins. */
export function listOrgMembers(userId: string, orgId: string): Promise<OrgMember[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<OrgMember>(
      `SELECT sm.site_id, s.name AS site_name, sm.user_id, u.email, u.name, sm.status,
              sm.created_at
         FROM site_members sm
         JOIN org_sites s ON s.id = sm.site_id
         JOIN users u ON u.id = sm.user_id
        WHERE s.org_id = $1 AND app.is_org_admin(s.org_id)
        ORDER BY sm.status DESC, s.name, u.email`,
      [orgId],
    );
    return rows;
  });
}

export function setMemberActive(
  userId: string,
  siteId: string,
  memberId: string,
): Promise<boolean> {
  return withUser(userId, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE site_members SET status = 'active'
        WHERE site_id = $1 AND user_id = $2 AND app.is_org_admin(app.site_org(site_id))`,
      [siteId, memberId],
    );
    return (rowCount ?? 0) > 0;
  });
}

/** Mitglied entfernen oder Antrag ablehnen (Offboarding; Kennzeichen verfallen per Trigger). */
export function removeMember(userId: string, siteId: string, memberId: string): Promise<boolean> {
  return withUser(userId, async (client) => {
    const { rowCount } = await client.query(
      `DELETE FROM site_members
        WHERE site_id = $1 AND user_id = $2 AND app.is_org_admin(app.site_org(site_id))`,
      [siteId, memberId],
    );
    return (rowCount ?? 0) > 0;
  });
}

/** Kennzeichen der Organisation mit Halter-E-Mail, offene zuerst. */
export function listOrgPlates(userId: string, orgId: string): Promise<OrgPlate[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<OrgPlate>(
      `SELECT vp.id, vp.plate_number, vp.verification_status, vp.created_at, u.email, u.name
         FROM verified_plates vp
         JOIN users u ON u.id = vp.user_id
        WHERE vp.org_id = $1 AND app.is_org_admin(vp.org_id)
          AND vp.verification_status IN ('pending', 'approved')
        ORDER BY vp.verification_status DESC, vp.plate_number`,
      [orgId],
    );
    return rows;
  });
}

export function listAllowlist(userId: string, orgId: string): Promise<string[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{ plate_number: string }>(
      `SELECT plate_number FROM org_plate_allowlist
        WHERE org_id = $1 AND app.is_org_admin(org_id) ORDER BY plate_number`,
      [orgId],
    );
    return rows.map((r) => r.plate_number);
  });
}

/** Kennzeichen muss bereits kanonisch sein (`parsePlate`). */
export function addAllowlistPlate(userId: string, orgId: string, plate: string): Promise<void> {
  return withUser(userId, async (client) => {
    await client.query(
      `INSERT INTO org_plate_allowlist (org_id, plate_number)
       SELECT $1, $2 WHERE app.is_org_admin($1)
       ON CONFLICT DO NOTHING`,
      [orgId, plate],
    );
  });
}

export function removeAllowlistPlate(userId: string, orgId: string, plate: string): Promise<void> {
  return withUser(userId, async (client) => {
    await client.query(
      `DELETE FROM org_plate_allowlist
        WHERE org_id = $1 AND plate_number = $2 AND app.is_org_admin(org_id)`,
      [orgId, plate],
    );
  });
}

export function updateOrgSettings(
  userId: string,
  orgId: string,
  settings: { showSender: boolean; allowFreeText: boolean },
): Promise<boolean> {
  return withUser(userId, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE organizations SET show_sender = $2, allow_free_text = $3
        WHERE id = $1 AND app.is_org_admin(id)`,
      [orgId, settings.showSender, settings.allowFreeText],
    );
    return (rowCount ?? 0) > 0;
  });
}

/** Vorfälle je Woche und Standort, letzte 12 Wochen – nie je Person. */
export function orgWeeklyStats(userId: string, orgId: string): Promise<OrgWeeklyStat[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{ week: Date; site_name: string; incidents: string }>(
      "SELECT week, site_name, incidents FROM app.org_weekly_stats($1)",
      [orgId],
    );
    return rows.map((r) => ({
      week: r.week,
      site_name: r.site_name,
      incidents: Number(r.incidents),
    }));
  });
}
