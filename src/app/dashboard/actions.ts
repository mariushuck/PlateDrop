"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  claimPlate as claimPlateQuery,
  PlateAlreadyClaimedError,
  plateBelongsToUser,
  setProofPath,
} from "@/lib/db/queries";
import { deleteProof, saveProof, UnsupportedProofTypeError } from "@/lib/storage/proofs";
import { normalizePlate, validateGermanPlate } from "@/lib/utils/plateUtils";
import { generateVerificationCode } from "@/lib/utils/verificationCode";

/** Maximale Größe eines Beweisfotos. */
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

export async function claimPlate(
  _prevState: { success: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const plateNumber = formData.get("plateNumber") as string;

  if (!plateNumber?.trim()) {
    return { success: false, error: "Bitte geben Sie ein Kennzeichen ein." };
  }

  if (!validateGermanPlate(plateNumber)) {
    return {
      success: false,
      error: "Ungültiges deutsches Kennzeichen. Beispiel: KA-AB-1234",
    };
  }

  const user = await requireUser();
  const normalizedPlate = normalizePlate(plateNumber);

  try {
    await claimPlateQuery(user.id, normalizedPlate, generateVerificationCode);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    if (err instanceof PlateAlreadyClaimedError) {
      return { success: false, error: "Dieses Kennzeichen ist bereits registriert." };
    }
    console.error("Fehler beim Registrieren des Kennzeichens:", err);
    return { success: false, error: "Fehler beim Registrieren des Kennzeichens." };
  }
}

export async function uploadProof(
  plateId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string; url?: string }> {
  const user = await requireUser();

  const file = formData.get("proof");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Bitte wählen Sie ein Bild aus." };
  }

  if (!file.type.startsWith("image/")) {
    return { success: false, error: "Bitte wählen Sie ein gültiges Bildformat." };
  }

  if (file.size > MAX_PROOF_BYTES) {
    return { success: false, error: "Die Datei ist zu groß. Maximum 5MB." };
  }

  // Erst die Eigentümerschaft prüfen, dann schreiben — für ein fremdes oder
  // erfundenes `plateId` landet keine Datei im Volume.
  if (!(await plateBelongsToUser(user.id, plateId))) {
    return { success: false, error: "Kennzeichen nicht gefunden." };
  }

  try {
    const objectPath = await saveProof(user.id, plateId, file);
    // setProofPath filtert weiterhin über `user_id` und die RLS-Policy greift –
    // ein Fehlschlag hier ist also der Rennen-Fall und die Datei muss wieder weg.
    const { updated, previousPath } = await setProofPath(user.id, plateId, objectPath);

    if (!updated) {
      await deleteProof(objectPath);
      return { success: false, error: "Kennzeichen nicht gefunden." };
    }

    // Das ersetzte Foto entfernen. Erst nach dem erfolgreichen Eintrag, damit
    // ein Fehlschlag nicht das alte Bild mitnimmt.
    if (previousPath && previousPath !== objectPath) {
      await deleteProof(previousPath).catch((err: unknown) => {
        // Ein verwaistes Altbild ist ärgerlich, aber kein Grund, den Upload
        // scheitern zu lassen. prune-proofs.mjs räumt es später ab.
        console.error("Ersetztes Beweisfoto konnte nicht entfernt werden:", err);
      });
    }

    revalidatePath("/dashboard");
    return { success: true, url: objectPath };
  } catch (err) {
    if (err instanceof UnsupportedProofTypeError) {
      return {
        success: false,
        error: "Nicht unterstütztes Bildformat. Erlaubt sind JPEG, PNG, WebP und HEIC.",
      };
    }
    console.error("Fehler beim Hochladen des Bildes:", err);
    return { success: false, error: "Fehler beim Hochladen des Bildes." };
  }
}
