"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

const UNEXPECTED_ERROR = "Ein unerwarteter Fehler ist aufgetreten.";

export async function signUp(
  _prevState: { success: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { success: false, error: "E-Mail und Passwort erforderlich." };
  }

  if (password.length < 6) {
    return {
      success: false,
      error: "Passwort muss mindestens 6 Zeichen lang sein.",
    };
  }

  try {
    // better-auth legt den Nutzer an und verschickt die Bestätigungsmail.
    // Angemeldet wird erst nach bestätigter Adresse.
    await auth.api.signUpEmail({
      body: { name: email, email, password },
      headers: await headers(),
    });
    return { success: true };
  } catch (err) {
    if (err instanceof APIError) {
      // Keine Rückmeldung darüber, ob die Adresse bereits existiert –
      // das wäre eine Auskunft über fremde Konten.
      console.error("Registrierung fehlgeschlagen:", err.message);
      return { success: false, error: "Registrierung nicht möglich." };
    }
    console.error("Unerwarteter Fehler bei der Registrierung:", err);
    return { success: false, error: UNEXPECTED_ERROR };
  }
}

export async function signIn(
  _prevState: { success: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { success: false, error: "E-Mail und Passwort erforderlich." };
  }

  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (err) {
    if (err instanceof APIError) {
      // Unbestätigte Adresse und falsches Passwort führen bewusst zur selben
      // Meldung, damit sich Konten nicht durchprobieren lassen.
      return { success: false, error: "Ungültige E-Mail oder Passwort." };
    }
    console.error("Unerwarteter Fehler bei der Anmeldung:", err);
    return { success: false, error: UNEXPECTED_ERROR };
  }

  // redirect() wirft – deshalb außerhalb des try-Blocks.
  redirect("/dashboard");
}

export async function signOut() {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch (err) {
    console.error("Fehler beim Abmelden:", err);
  }
  redirect("/");
}
