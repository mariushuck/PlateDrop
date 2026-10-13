"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  claimPlate as claimPlateQuery,
  deletePlate,
  hideMessage,
  markMessagesRead,
  PlateAlreadyClaimedError,
  plateBelongsToUser,
  reportMessage,
  setPlatePause,
  setProofPath,
  TooManyOpenClaimsError,
} from "@/lib/db/queries";
import { logger } from "@/lib/logger";
import { REPORT_REASONS } from "@/lib/messages/reportReasons";
import { deleteProof, saveProof, UnsupportedProofTypeError } from "@/lib/storage/proofs";
import { parsePlate, plateErrorMessage } from "@/lib/utils/plateUtils";
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

  const parsedPlate = parsePlate(plateNumber);
  if (!parsedPlate.ok) {
    return { success: false, error: plateErrorMessage(parsedPlate.reason) };
  }

  const user = await requireUser();
  const normalizedPlate = parsedPlate.plate;

  try {
    await claimPlateQuery(user.id, normalizedPlate, generateVerificationCode);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    if (err instanceof PlateAlreadyClaimedError || err instanceof TooManyOpenClaimsError) {
      return { success: false, error: err.message };
    }
    logger.error("Fehler beim Registrieren des Kennzeichens:", err);
    return { success: false, error: "Fehler beim Registrieren des Kennzeichens." };
  }
}

/** Blendet eine Nachricht für den Empfänger aus. */
export async function hideMessageAction(
  messageId: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  try {
    if (!(await hideMessage(user.id, messageId))) {
      return { success: false, error: "Nachricht nicht gefunden." };
    }
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    logger.error("Fehler beim Ausblenden der Nachricht:", err);
    return { success: false, error: "Fehler beim Ausblenden der Nachricht." };
  }
}

/** Meldet eine Nachricht an den Admin und blendet sie aus. */
export async function reportMessageAction(
  messageId: string,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) {
    return { success: false, error: "Bitte einen Grund wählen." };
  }
  try {
    if (!(await reportMessage(user.id, messageId, reason))) {
      return { success: false, error: "Nachricht nicht gefunden." };
    }
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    logger.error("Fehler beim Melden der Nachricht:", err);
    return { success: false, error: "Fehler beim Melden der Nachricht." };
  }
}

/** Markiert angezeigte Nachrichten als gelesen. Fehler sind hier nur ein Logeintrag wert. */
export async function markMessagesReadAction(messageIds: string[]): Promise<void> {
  const user = await requireUser();
  if (!Array.isArray(messageIds) || messageIds.length === 0) return;
  try {
    await markMessagesRead(user.id, messageIds.slice(0, 200));
  } catch (err) {
    logger.error("Fehler beim Markieren als gelesen:", err);
  }
}

/** Erlaubte Pausen in Stunden; `null` hebt die Pause auf. */
const PAUSE_HOURS = [1, 8, 24, 168];

/** Pausiert die Benachrichtigungen für ein eigenes Kennzeichen. */
export async function setPlatePauseAction(
  plateId: string,
  hours: number | null,
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  if (hours !== null && !PAUSE_HOURS.includes(hours)) {
    return { success: false, error: "Ungültige Dauer." };
  }
  try {
    const until = hours === null ? null : new Date(Date.now() + hours * 3_600_000);
    if (!(await setPlatePause(user.id, plateId, until))) {
      return { success: false, error: "Kennzeichen nicht gefunden." };
    }
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    logger.error("Fehler beim Pausieren:", err);
    return { success: false, error: "Fehler beim Pausieren." };
  }
}

/** Entfernt ein eigenes Kennzeichen samt Beweisfoto. */
export async function removePlate(plateId: string): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  try {
    const { deleted, proofPath } = await deletePlate(user.id, plateId);
    if (!deleted) {
      return { success: false, error: "Kennzeichen nicht gefunden." };
    }
    if (proofPath) {
      await deleteProof(proofPath).catch((err: unknown) => {
        // prune-proofs.mjs räumt eine liegengebliebene Datei später ab.
        logger.error("Beweisfoto des entfernten Kennzeichens konnte nicht gelöscht werden:", err);
      });
    }
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    logger.error("Fehler beim Entfernen des Kennzeichens:", err);
    return { success: false, error: "Fehler beim Entfernen des Kennzeichens." };
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
        logger.error("Ersetztes Beweisfoto konnte nicht entfernt werden:", err);
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
    logger.error("Fehler beim Hochladen des Bildes:", err);
    return { success: false, error: "Fehler beim Hochladen des Bildes." };
  }
}
