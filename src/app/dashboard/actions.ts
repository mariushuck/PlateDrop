"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  claimPlate as claimPlateQuery,
  PlateAlreadyClaimedError,
  setProofPath,
} from "@/lib/db/queries";
import { saveProof, UnsupportedProofTypeError } from "@/lib/storage/proofs";
import { normalizePlate, validateGermanPlate } from "@/lib/utils/plateUtils";

/** Maximale Größe eines Beweisfotos. */
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

/**
 * Generate a random 6-character verification code in format "XX-XXXX"
 * Example: "PD-8X4A"
 */
function generateVerificationCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${code.slice(0, 2)}-${code.slice(2)}`;
}

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
    await claimPlateQuery(user.id, normalizedPlate, generateVerificationCode());
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

  try {
    // Erst die Datei ablegen, dann den Pfad eintragen. Gehört das Kennzeichen
    // dem Nutzer nicht, greift die Policy und der Eintrag unterbleibt.
    const objectPath = await saveProof(user.id, plateId, file);
    const { updated } = await setProofPath(user.id, plateId, objectPath);

    if (!updated) {
      return { success: false, error: "Kennzeichen nicht gefunden." };
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
