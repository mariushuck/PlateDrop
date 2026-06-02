"use server";

import { createClient } from "@/lib/supabase/server";

export async function changePassword(
  _prev: { error: string | null; success: boolean },
  formData: FormData
) {
  const password = formData.get("password") as string;
  const confirm = formData.get("confirm") as string;

  if (password !== confirm) return { error: "Passwörter stimmen nicht überein.", success: false };
  if (password.length < 6) return { error: "Passwort muss mindestens 6 Zeichen haben.", success: false };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Fehler beim Aktualisieren des Passworts.", success: false };
  return { error: null, success: true };
}

export async function changeEmail(
  _prev: { error: string | null; success: boolean },
  formData: FormData
) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  if (!email) return { error: "E-Mail-Adresse erforderlich.", success: false };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard` }
  );
  if (error) return { error: "Fehler beim Aktualisieren der E-Mail-Adresse.", success: false };
  // Supabase sends a confirmation email to the new address before the change takes effect
  return { error: null, success: true };
}
