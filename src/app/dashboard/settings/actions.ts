"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/passwordPolicy";
import { auth } from "@/lib/auth/server";
import { requireUser } from "@/lib/auth/session";

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
    console.error("Fehler beim Aktualisieren des Passworts:", err);
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
    console.error("Fehler beim Aktualisieren der E-Mail-Adresse:", err);
    return { error: "Fehler beim Aktualisieren der E-Mail-Adresse.", success: false };
  }
}
