"use server";

import { checkMessageRate, insertMessage, PlateRateLimitError } from "@/lib/db/queries";
import { logger } from "@/lib/logger";
import { parseMessageTypes } from "@/lib/messages/catalog";
import { parsePlate, plateErrorMessage } from "@/lib/utils/plateUtils";
import { getClientIpHash } from "@/lib/utils/rateLimit";

const RATE_LIMIT_ERROR = "Zu viele Anfragen. Bitte versuchen Sie es in einigen Minuten erneut.";
const GENERIC_ERROR = "Fehler beim Speichern der Nachricht. Bitte versuchen Sie es später erneut.";

/**
 * Anonyme Nachricht an ein Kennzeichen. Absender wählen aus dem Katalog;
 * ein mitgeschicktes Freitextfeld wird ignoriert (strategy.md §2).
 */
export async function dropMessage(
  _prevState: { success: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const plateNumber = formData.get("plateNumber");
  const messageTypes = parseMessageTypes(formData.getAll("messageTypes"));

  if (typeof plateNumber !== "string" || !plateNumber.trim()) {
    return { success: false, error: "Bitte geben Sie ein Kennzeichen ein." };
  }

  const parsedPlate = parsePlate(plateNumber);
  if (!parsedPlate.ok) {
    return { success: false, error: plateErrorMessage(parsedPlate.reason) };
  }

  if (!messageTypes?.length) {
    return { success: false, error: "Bitte wählen Sie eine Nachricht aus." };
  }

  try {
    // Limit je Absender (pseudonymisiert). Ohne bestimmbare IP wird durch-
    // gelassen; der Deckel je Kennzeichen greift dann als Backstop.
    const allowed = await checkMessageRate(await getClientIpHash());
    if (!allowed) {
      return { success: false, error: RATE_LIMIT_ERROR };
    }

    await insertMessage(parsedPlate.plate, messageTypes);
    return { success: true };
  } catch (err) {
    if (err instanceof PlateRateLimitError) {
      return { success: false, error: RATE_LIMIT_ERROR };
    }
    logger.error("Fehler beim Speichern der Nachricht:", err);
    return { success: false, error: GENERIC_ERROR };
  }
}
