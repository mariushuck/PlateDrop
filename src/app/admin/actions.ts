"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { deleteReportedMessage, resolveReport, setPlateVerification } from "@/lib/db/queries";
import { sendMail } from "@/lib/email/mailer";
import { plateSupersededEmail } from "@/lib/email/templates";
import { requireEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

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
    const { changed, plateNumber, supersededEmails } = await setPlateVerification(
      user.id,
      plateId,
      approved,
    );

    if (!changed) {
      return { success: false, error: "Kennzeichen nicht gefunden." };
    }

    // Erst nach dem Commit: die Freigabe gilt, auch wenn eine Mail scheitert.
    if (plateNumber) {
      const mail = plateSupersededEmail(plateNumber, `${requireEnv("BETTER_AUTH_URL")}/dashboard`);
      for (const to of supersededEmails) {
        await sendMail({ to, ...mail }).catch((err: unknown) =>
          logger.error("Mail an abgelösten Halter fehlgeschlagen:", err),
        );
      }
    }

    revalidatePath("/admin");
    return { success: true };
  } catch (err) {
    logger.error("Fehler beim Aktualisieren der Verifizierung:", err);
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

/** Gemeinsame Hülle für die Admin-Aktionen an Meldungen. */
async function asAdmin(
  label: string,
  run: (adminId: string) => Promise<boolean>,
): Promise<{ success: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: "Sie müssen angemeldet sein." };
  if (!user.isAdmin) return { success: false, error: NOT_ALLOWED };

  try {
    if (!(await run(user.id))) return { success: false, error: "Meldung nicht gefunden." };
    revalidatePath("/admin");
    return { success: true };
  } catch (err) {
    logger.error(`Fehler beim ${label}:`, err);
    return { success: false, error: `Fehler beim ${label}.` };
  }
}

/** Schließt eine Meldung; die Nachricht bleibt (für den Empfänger ausgeblendet). */
export async function resolveReportAction(
  reportId: string,
): Promise<{ success: boolean; error?: string }> {
  return asAdmin("Schließen der Meldung", (adminId) => resolveReport(adminId, reportId));
}

/** Löscht eine gemeldete Nachricht endgültig (Abhilfe nach DSA). */
export async function deleteReportedMessageAction(
  messageId: string,
): Promise<{ success: boolean; error?: string }> {
  return asAdmin("Löschen der Nachricht", async (adminId) => {
    const deleted = await deleteReportedMessage(adminId, messageId);
    // Ohne Inhalt, aber mit Zeitpunkt und Admin: nachvollziehbar, wer wann eingegriffen hat.
    if (deleted) logger.info("Gemeldete Nachricht gelöscht", { messageId, adminId });
    return deleted;
  });
}
