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
  /** Organisation (0014); `null` = öffentliches Kennzeichen. */
  org_id: string | null;
  /** Name der Organisation, nur aus `listPlatesForUser`. */
  org_name?: string | null;
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
  message_types: string[] | null;
  /** Freitext – seit 0013 nicht mehr von anonymen Absendern. */
  message_text: string | null;
  created_at: Date;
  read_at: Date | null;
  /** Kennzeichen-Zeile, an die die Nachricht ging (nur aus `listMessagesForUser`). */
  plate_id?: string;
  /** Standort bei Nachrichten über einen Standort-QR (0014). */
  site_name?: string | null;
  /** Absendername, nur wenn die Organisation ihn zeigt. */
  sender_name?: string | null;
}

/** Offene Meldung für die Admin-Ansicht (0012). */
export interface OpenReport {
  id: string;
  reason: string;
  created_at: Date;
  message_id: string;
  plate_number: string;
  message_types: string[] | null;
  message_text: string | null;
  message_created_at: Date;
}

/** Benachrichtigungs-Einstellungen (0013). Ruhezeiten als volle Stunden Europe/Berlin. */
export interface NotificationSettings {
  email_enabled: boolean;
  quiet_start: number | null;
  quiet_end: number | null;
}

// --- Organisationen (0014) --------------------------------------------------

/** Ergebnis von `app.site_by_token()` für das öffentliche Standort-Formular. */
export interface SiteInfo {
  siteId: string;
  siteName: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  allowFreeText: boolean;
  showSender: boolean;
  active: boolean;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  show_sender: boolean;
  allow_free_text: boolean;
}

export interface OrgSite {
  id: string;
  name: string;
  token: string;
  disabled: boolean;
}

export interface Membership {
  site_id: string;
  site_name: string;
  org_id: string;
  /** `null`, solange die Mitgliedschaft nicht bestätigt ist. */
  org_name: string | null;
  status: "pending" | "active";
}

export interface OrgMember {
  site_id: string;
  site_name: string;
  user_id: string;
  email: string;
  name: string;
  status: "pending" | "active";
  created_at: Date;
}

export interface OrgPlate {
  id: string;
  plate_number: string;
  verification_status: VerificationStatus;
  created_at: Date;
  email: string;
  name: string;
}

export interface OrgWeeklyStat {
  week: Date;
  site_name: string;
  incidents: number;
}
