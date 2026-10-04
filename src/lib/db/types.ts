/**
 * Zeilentypen der Fachtabellen. Früher aus Supabase generiert
 * (src/types/database.types.ts), jetzt von Hand gepflegt — bei vier Tabellen
 * ist das übersichtlicher als ein Generator. Muss zu db/migrations/0003 passen.
 */

export type VerificationStatus = "pending" | "approved" | "rejected";

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
}

export interface Message {
  id: string;
  plate_number: string;
  message_text: string;
  created_at: Date;
}
