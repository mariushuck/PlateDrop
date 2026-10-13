/**
 * Zeilentypen der Fachtabellen. Früher aus Supabase generiert
 * (src/types/database.types.ts), jetzt von Hand gepflegt — bei vier Tabellen
 * ist das übersichtlicher als ein Generator. Muss zu db/migrations/0003 passen.
 */

/** `expired`: ohne Foto verfallen (prune-claims), `superseded`: durch einen neuen Halter abgelöst (0011). */
export type VerificationStatus = "pending" | "approved" | "rejected" | "expired" | "superseded";

export interface VerifiedPlate {
  id: string;
  user_id: string;
  plate_number: string;
  is_verified: boolean;
  created_at: Date;
  verification_status: VerificationStatus;
  verification_code: string | null;
  /** Objektpfad im proofs-Verzeichnis, nie eine öffentliche URL. */
  proof_image_url: string | null;
  /** Benachrichtigungen pausiert bis (0012). */
  paused_until: Date | null;
}

/** Offene Verifizierung für die Admin-Ansicht. */
export interface PendingVerification extends VerifiedPlate {
  /** Ein anderer Halter ist für dieses Kennzeichen bereits freigegeben. */
  has_approved_holder: boolean;
}

export interface Message {
  id: string;
  plate_number: string;
  /** Code aus src/lib/messages/catalog.json; `null` nur bei Freitext-Altbestand. */
  message_type: string | null;
  /** Freitext – seit 0013 nicht mehr von anonymen Absendern. */
  message_text: string | null;
  created_at: Date;
  read_at: Date | null;
}

/** Offene Meldung für die Admin-Ansicht (0012). */
export interface OpenReport {
  id: string;
  reason: string;
  created_at: Date;
  message_id: string;
  plate_number: string;
  message_type: string | null;
  message_text: string | null;
  message_created_at: Date;
}

/** Benachrichtigungs-Einstellungen (0013). Ruhezeiten als volle Stunden Europe/Berlin. */
export interface NotificationSettings {
  email_enabled: boolean;
  quiet_start: number | null;
  quiet_end: number | null;
}
