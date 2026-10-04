"use server";

import { checkMessageRate, insertMessage, PlateRateLimitError } from "@/lib/db/queries";
import { logger } from "@/lib/logger";
import { parsePlate, plateErrorMessage } from "@/lib/utils/plateUtils";
import { getClientIpHash } from "@/lib/utils/rateLimit";

const RATE_LIMIT_ERROR = "Zu viele Anfragen. Bitte versuchen Sie es in einigen Minuten erneut.";
const GENERIC_ERROR = "Fehler beim Speichern der Nachricht. Bitte versuchen Sie es später erneut.";

export async function dropMessage(
  _prevState: { success: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const plateNumber = formData.get("plateNumber") as string;
  const messageText = formData.get("messageText") as string;

  // Validate plate
  if (!plateNumber?.trim()) {
    return { success: false, error: "Bitte geben Sie ein Kennzeichen ein." };
  }

  const parsedPlate = parsePlate(plateNumber);
  if (!parsedPlate.ok) {
    return { success: false, error: plateErrorMessage(parsedPlate.reason) };
  }

  // Validate message
  if (!messageText?.trim()) {
    return { success: false, error: "Nachricht darf nicht leer sein." };
  }

  if (messageText.length > 500) {
    return {
      success: false,
      error: "Nachricht darf nicht länger als 500 Zeichen sein.",
    };
  }

  const normalizedPlate = parsedPlate.plate;

  try {
    // Limit je Absender (pseudonymisiert). Ohne bestimmbare IP wird durch-
    // gelassen; der Deckel je Kennzeichen greift dann als Backstop.
    const allowed = await checkMessageRate(await getClientIpHash());
    if (!allowed) {
      return { success: false, error: RATE_LIMIT_ERROR };
    }

    await insertMessage(normalizedPlate, messageText.trim());
    return { success: true };
  } catch (err) {
    if (err instanceof PlateRateLimitError) {
      return { success: false, error: RATE_LIMIT_ERROR };
    }
    logger.error("Fehler beim Speichern der Nachricht:", err);
    return { success: false, error: GENERIC_ERROR };
  }
}
