"use server";

import { createClient } from "@/lib/supabase/server";

export async function requestPasswordReset(
  _prev: { error: string | null; success: boolean },
  formData: FormData
) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  if (!email) return { error: "E-Mail-Adresse erforderlich.", success: false };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
  });

  if (error) return { error: "Fehler beim Senden der E-Mail.", success: false };
  // Always return success to avoid email enumeration
  return { error: null, success: true };
}
