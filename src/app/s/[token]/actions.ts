"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser, requireUser } from "@/lib/auth/session";
import {
  checkMessageRate,
  insertSiteMessage,
  PlateRateLimitError,
  requestSiteMembership,
  siteByToken,
} from "@/lib/db/queries";
import { logger } from "@/lib/logger";
import { parseMessageTypes } from "@/lib/messages/catalog";
import { SITE_TOKEN_PATTERN } from "@/lib/tags/token";
import { parsePlate, plateErrorMessage } from "@/lib/utils/plateUtils";
import { getClientIpHash } from "@/lib/utils/rateLimit";

const RATE_LIMIT_ERROR = "Zu viele Anfragen. Bitte versuchen Sie es in einigen Minuten erneut.";
const UNKNOWN_SITE = "Dieser Code ist nicht (mehr) gültig.";
const MAX_TEXT = 500;

/**
 * Nachricht über den Standort-QR. Gleiche Rate-Limits wie das öffentliche
 * Formular. Angemeldete Absender werden eingetragen; Freitext nur, wenn die
 * Organisation ihn erlaubt – ob der Absender Mitglied ist, prüft die Policy.
 */
export async function dropSiteMessage(
  _prev: { success: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const token = formData.get("token");
  const plateNumber = formData.get("plateNumber");
  const types = parseMessageTypes(formData.getAll("messageTypes"));
  const rawText = formData.get("messageText");
  const text = typeof rawText === "string" && rawText.trim() ? rawText.trim() : null;

  if (typeof token !== "string" || !SITE_TOKEN_PATTERN.test(token)) {
    return { success: false, error: UNKNOWN_SITE };
  }
  if (typeof plateNumber !== "string" || !plateNumber.trim()) {
    return { success: false, error: "Bitte geben Sie ein Kennzeichen ein." };
  }
  const parsed = parsePlate(plateNumber);
  if (!parsed.ok) return { success: false, error: plateErrorMessage(parsed.reason) };

  if (!types || (types.length === 0 && !text)) {
    return { success: false, error: "Bitte wählen Sie eine Nachricht aus." };
  }
  if (text && text.length > MAX_TEXT) {
    return { success: false, error: `Nachricht darf nicht länger als ${MAX_TEXT} Zeichen sein.` };
  }

  try {
    const site = await siteByToken(token);
    if (!site?.active) return { success: false, error: UNKNOWN_SITE };

    const user = await getSessionUser();
    // Freitext nur angemeldet und wenn erlaubt; bei Gründen + Text zählen die Gründe.
    const sendText = types.length > 0 ? null : text;
    if (sendText && !(user && site.allowFreeText)) {
      return { success: false, error: "Bitte wählen Sie eine Nachricht aus." };
    }

    if (!(await checkMessageRate(await getClientIpHash()))) {
      return { success: false, error: RATE_LIMIT_ERROR };
    }

    await insertSiteMessage(user?.id ?? null, {
      plate: parsed.plate,
      types: types.length > 0 ? types : null,
      text: sendText,
      orgId: site.orgId,
      siteId: site.siteId,
    });
    return { success: true };
  } catch (err) {
    if (err instanceof PlateRateLimitError) return { success: false, error: RATE_LIMIT_ERROR };
    logger.error("Fehler beim Speichern der Standort-Nachricht:", err);
    return {
      success: false,
      error: "Nachricht konnte nicht gesendet werden. Sind Sie Mitglied dieses Geländes?",
    };
  }
}

/** Beitritt zu einem Standort beantragen; ein Org-Admin bestätigt ihn. */
export async function joinSite(token: string): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  if (!SITE_TOKEN_PATTERN.test(token)) return { success: false, error: UNKNOWN_SITE };

  try {
    const site = await siteByToken(token);
    if (!site?.active) return { success: false, error: UNKNOWN_SITE };
    await requestSiteMembership(user.id, site.siteId);
    revalidatePath(`/s/${token}`);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    logger.error("Fehler beim Beitrittsantrag:", err);
    return { success: false, error: "Beitritt konnte nicht beantragt werden." };
  }
}
