"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { setPlateVerification } from "@/lib/db/queries";

const NOT_ALLOWED = "Sie haben keine Berechtigung für diese Aktion.";

/**
 * Genehmigt oder lehnt ein Kennzeichen ab.
 *
 * Zwei Prüfungen: hier das Admin-Flag der Session, und in der Datenbank die
 * Policy `verified_plates_update_admin`. Fällt eine aus, hält die andere.
 */
async function setVerification(
  plateId: string,
  approved: boolean,
): Promise<{ success: boolean; error?: string }> {
  const user = await getSessionUser();

  if (!user) {
    return { success: false, error: "Sie müssen angemeldet sein." };
  }

  if (!user.isAdmin) {
    return { success: false, error: NOT_ALLOWED };
  }

  try {
    const changed = await setPlateVerification(user.id, plateId, approved);

    if (!changed) {
      return { success: false, error: "Kennzeichen nicht gefunden." };
    }

    revalidatePath("/admin");
    return { success: true };
  } catch (err) {
    console.error("Fehler beim Aktualisieren der Verifizierung:", err);
    return {
      success: false,
      error: approved
        ? "Fehler beim Genehmigen des Kennzeichens."
        : "Fehler beim Ablehnen des Kennzeichens.",
    };
  }
}

export async function approvePlate(plateId: string): Promise<{ success: boolean; error?: string }> {
  return setVerification(plateId, true);
}

export async function rejectPlate(plateId: string): Promise<{ success: boolean; error?: string }> {
  return setVerification(plateId, false);
}
