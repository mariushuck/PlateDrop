"use server";

import { auth } from "@/lib/auth/server";

export async function requestPasswordReset(
  _prev: { error: string | null; success: boolean },
  formData: FormData,
) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  if (!email) return { error: "E-Mail-Adresse erforderlich.", success: false };

  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
    });
  } catch (err) {
    // Auch im Fehlerfall Erfolg melden: eine Unterscheidung würde verraten,
    // welche Adressen registriert sind.
    console.error("Fehler beim Senden der Reset-E-Mail:", err);
  }

  return { error: null, success: true };
}
