"use server";

import { APIError } from "better-auth/api";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/passwordPolicy";
import { auth } from "@/lib/auth/server";
import { logger } from "@/lib/logger";

/**
 * Setzt das Passwort über den Token aus der Reset-E-Mail neu.
 *
 * Unter Supabase lief das über einen clientseitigen `PASSWORD_RECOVERY`-Event:
 * der Link stellte eine Session her, und die Seite rief `updateUser` auf. Hier
 * ist der Token ein reiner Einmal-Token – ohne Session, ohne Client-SDK.
 */
export async function resetPassword(
  _prev: { error: string | null; success: boolean },
  formData: FormData,
) {
  const token = formData.get("token") as string;
  const password = formData.get("password") as string;
  const confirm = formData.get("confirm") as string;

  if (!token) {
    return { error: "Der Link ist ungültig oder abgelaufen.", success: false };
  }
  if (password !== confirm) {
    return { error: "Passwörter stimmen nicht überein.", success: false };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`,
      success: false,
    };
  }

  try {
    await auth.api.resetPassword({ body: { token, newPassword: password } });
    return { error: null, success: true };
  } catch (err) {
    if (err instanceof APIError) {
      return { error: "Der Link ist ungültig oder abgelaufen.", success: false };
    }
    logger.error("Fehler beim Zurücksetzen des Passworts:", err);
    return { error: "Fehler beim Zurücksetzen des Passworts.", success: false };
  }
}
