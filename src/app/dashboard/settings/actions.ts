"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/passwordPolicy";
import { auth } from "@/lib/auth/server";
import { requireUser } from "@/lib/auth/session";
import { exportUserData, saveNotificationSettings } from "@/lib/db/queries";
import { logger } from "@/lib/logger";

export async function changePassword(
  _prev: { error: string | null; success: boolean },
  formData: FormData,
) {
  const currentPassword = formData.get("currentPassword") as string;
  const password = formData.get("password") as string;
  const confirm = formData.get("confirm") as string;

  if (!currentPassword) {
    return { error: "Bitte geben Sie Ihr aktuelles Passwort ein.", success: false };
  }
  if (password !== confirm) return { error: "Passwörter stimmen nicht überein.", success: false };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`,
      success: false,
    };
  }

  await requireUser();

  try {
    // better-auth verlangt das bisherige Passwort. Das ist strenger als zuvor
    // und verhindert, dass eine übernommene Session das Konto abschließt.
    await auth.api.changePassword({
      body: { currentPassword, newPassword: password, revokeOtherSessions: true },
      headers: await headers(),
    });
    return { error: null, success: true };
  } catch (err) {
    if (err instanceof APIError) {
      return { error: "Aktuelles Passwort ist nicht korrekt.", success: false };
    }
    logger.error("Fehler beim Aktualisieren des Passworts:", err);
    return { error: "Fehler beim Aktualisieren des Passworts.", success: false };
  }
}

export async function changeEmail(
  _prev: { error: string | null; success: boolean },
  formData: FormData,
) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  if (!email) return { error: "E-Mail-Adresse erforderlich.", success: false };

  await requireUser();

  try {
    // Die Bestätigung geht an die BISHERIGE Adresse; erst danach wird die
    // Änderung wirksam (src/lib/auth/server.ts).
    await auth.api.changeEmail({
      body: { newEmail: email, callbackURL: "/dashboard" },
      headers: await headers(),
    });
    return { error: null, success: true };
  } catch (err) {
    if (err instanceof APIError) {
      return { error: "Fehler beim Aktualisieren der E-Mail-Adresse.", success: false };
    }
    logger.error("Fehler beim Aktualisieren der E-Mail-Adresse:", err);
    return { error: "Fehler beim Aktualisieren der E-Mail-Adresse.", success: false };
  }
}

/**
 * Löscht das Konto samt Sessions, Konten, Kennzeichen (FK-Kaskade) und den
 * Beweisfotos (beforeDelete-Hook in src/lib/auth/server.ts). Nachrichten an
 * fremde Kennzeichen bleiben anonym erhalten. Verlangt das Passwort.
 */
export async function deleteAccount(
  _prev: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const password = formData.get("password") as string;
  if (!password) return { error: "Bitte Passwort zur Bestätigung eingeben." };

  await requireUser();

  let deleted = false;
  try {
    await auth.api.deleteUser({ body: { password }, headers: await headers() });
    deleted = true;
  } catch (err) {
    if (err instanceof APIError) {
      return { error: "Passwort ist nicht korrekt." };
    }
    logger.error("Fehler beim Löschen des Kontos:", err);
    return { error: "Das Konto konnte nicht gelöscht werden." };
  }

  if (deleted) redirect("/");
  return { error: null };
}

/**
 * Gibt die personenbezogenen Daten des Nutzers als JSON zurück (Art. 15/20
 * DSGVO). Das Client-Formular bietet sie als Download an.
 */
export async function exportMyData(): Promise<{ filename: string; json: string }> {
  const user = await requireUser();
  const data = await exportUserData(user.id);

  const payload = {
    exportiert_am: new Date().toISOString(),
    konto: { id: user.id, email: user.email, email_bestaetigt: user.emailVerified },
    kennzeichen: data.plates,
    nachrichten_an_meine_kennzeichen: data.messages,
  };

  return {
    filename: `platedrop-datenexport-${new Date().toISOString().slice(0, 10)}.json`,
    json: JSON.stringify(payload, null, 2),
  };
}

/** Liest eine volle Stunde 0–23 aus dem Formular; leer = keine. */
function hourField(value: FormDataEntryValue | null): number | null | undefined {
  if (value === null || value === "") return null;
  const hour = Number(value);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : undefined;
}

export async function saveNotificationSettingsAction(
  _prev: { error: string | null; success: boolean },
  formData: FormData,
): Promise<{ error: string | null; success: boolean }> {
  const user = await requireUser();
  const quietStart = hourField(formData.get("quietStart"));
  const quietEnd = hourField(formData.get("quietEnd"));

  if (quietStart === undefined || quietEnd === undefined) {
    return { error: "Ungültige Uhrzeit.", success: false };
  }
  if ((quietStart === null) !== (quietEnd === null)) {
    return { error: "Bitte Beginn und Ende der Ruhezeit wählen.", success: false };
  }

  try {
    await saveNotificationSettings(user.id, {
      email_enabled: formData.get("emailEnabled") === "on",
      quiet_start: quietStart,
      quiet_end: quietEnd,
    });
    return { error: null, success: true };
  } catch (err) {
    logger.error("Fehler beim Speichern der Benachrichtigungs-Einstellungen:", err);
    return { error: "Einstellungen konnten nicht gespeichert werden.", success: false };
  }
}
