"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  addAllowlistPlate,
  createSite,
  orgForAdmin,
  removeAllowlistPlate,
  removeMember,
  renewSiteToken,
  setMemberActive,
  setPlateVerification,
  setSiteDisabled,
  updateOrgSettings,
} from "@/lib/db/queries";
import type { Organization } from "@/lib/db/types";
import { sendMail } from "@/lib/email/mailer";
import { plateSupersededEmail } from "@/lib/email/templates";
import { requireEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { generateSiteToken } from "@/lib/tags/token";
import { parsePlate, plateErrorMessage } from "@/lib/utils/plateUtils";

type Result = { success: boolean; error?: string };

/**
 * Gemeinsame Hülle: angemeldet, Org-Admin dieser Organisation (Session +
 * `app.is_org_admin` in der Query), Fehler protokolliert. Die Queries prüfen
 * die Rolle zusätzlich je Statement, die Policies aus 0014 ein drittes Mal.
 */
async function asOrgAdmin(
  slug: string,
  label: string,
  run: (adminId: string, org: Organization) => Promise<boolean | Result>,
): Promise<Result> {
  const user = await requireUser();
  try {
    const org = await orgForAdmin(user.id, slug);
    if (!org) return { success: false, error: "Keine Berechtigung für diese Organisation." };
    const outcome = await run(user.id, org);
    const result = typeof outcome === "boolean" ? { success: outcome } : outcome;
    if (result.success) revalidatePath(`/o/${slug}/admin`);
    return result.success || result.error ? result : { success: false, error: "Nicht gefunden." };
  } catch (err) {
    logger.error(`Fehler beim ${label}:`, err);
    return { success: false, error: `Fehler beim ${label}.` };
  }
}

export async function approveMemberAction(slug: string, siteId: string, memberId: string) {
  return asOrgAdmin(slug, "Bestätigen der Mitgliedschaft", (adminId) =>
    setMemberActive(adminId, siteId, memberId),
  );
}

export async function removeMemberAction(slug: string, siteId: string, memberId: string) {
  return asOrgAdmin(slug, "Entfernen des Mitglieds", (adminId) =>
    removeMember(adminId, siteId, memberId),
  );
}

export async function decidePlateAction(slug: string, plateId: string, approved: boolean) {
  return asOrgAdmin(slug, "Entscheiden über das Kennzeichen", async (adminId) => {
    const result = await setPlateVerification(adminId, plateId, approved);
    if (result.changed && result.plateNumber) {
      const mail = plateSupersededEmail(
        result.plateNumber,
        `${requireEnv("BETTER_AUTH_URL")}/dashboard`,
      );
      for (const to of result.supersededEmails) {
        await sendMail({ to, ...mail }).catch((err: unknown) =>
          logger.error("Mail an abgelösten Halter fehlgeschlagen:", err),
        );
      }
    }
    return result.changed;
  });
}

export async function createSiteAction(slug: string, _prev: Result | null, formData: FormData) {
  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
    return { success: false, error: "Bitte einen Namen mit höchstens 100 Zeichen angeben." };
  }
  return asOrgAdmin(slug, "Anlegen des Standorts", async (adminId, org) => {
    await createSite(adminId, org.id, name.trim(), generateSiteToken());
    return true;
  });
}

export async function setSiteDisabledAction(slug: string, siteId: string, disabled: boolean) {
  return asOrgAdmin(slug, "Ändern des Standorts", (adminId) =>
    setSiteDisabled(adminId, siteId, disabled),
  );
}

/** Neues Token: alte Aushänge und QR-Codes führen danach ins Leere. */
export async function renewSiteTokenAction(slug: string, siteId: string) {
  return asOrgAdmin(slug, "Erneuern des Codes", (adminId) =>
    renewSiteToken(adminId, siteId, generateSiteToken()),
  );
}

export async function addAllowlistAction(slug: string, _prev: Result | null, formData: FormData) {
  const plate = formData.get("plateNumber");
  if (typeof plate !== "string" || !plate.trim()) {
    return { success: false, error: "Bitte ein Kennzeichen eingeben." };
  }
  const parsed = parsePlate(plate);
  if (!parsed.ok) return { success: false, error: plateErrorMessage(parsed.reason) };
  return asOrgAdmin(slug, "Hinzufügen zur Fuhrparkliste", async (adminId, org) => {
    await addAllowlistPlate(adminId, org.id, parsed.plate);
    return true;
  });
}

export async function removeAllowlistAction(slug: string, plate: string) {
  return asOrgAdmin(slug, "Entfernen aus der Fuhrparkliste", async (adminId, org) => {
    await removeAllowlistPlate(adminId, org.id, plate);
    return true;
  });
}

export async function saveOrgSettingsAction(
  slug: string,
  _prev: Result | null,
  formData: FormData,
) {
  return asOrgAdmin(slug, "Speichern der Einstellungen", (adminId, org) =>
    updateOrgSettings(adminId, org.id, {
      showSender: formData.get("showSender") === "on",
      allowFreeText: formData.get("allowFreeText") === "on",
    }),
  );
}
