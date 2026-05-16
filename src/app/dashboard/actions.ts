"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizePlate, validateGermanPlate } from "@/lib/utils/plateUtils";

export async function claimPlate(
  _prevState: { success: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const plateNumber = formData.get("plateNumber") as string;

  // Validate plate
  if (!plateNumber || !plateNumber.trim()) {
    return { success: false, error: "Bitte geben Sie ein Kennzeichen ein." };
  }

  if (!validateGermanPlate(plateNumber)) {
    return {
      success: false,
      error: "Ungültiges deutsches Kennzeichen. Beispiel: KA-AB-1234",
    };
  }

  // Get authenticated user
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return {
      success: false,
      error: "Sie müssen angemeldet sein.",
    };
  }

  // Normalize plate
  const normalizedPlate = normalizePlate(plateNumber);

  try {
    // Insert into verified_plates
    const { error } = await supabase.from("verified_plates").insert({
      user_id: userData.user.id,
      plate_number: normalizedPlate,
      is_verified: true,
    });

    if (error) {
      console.error("Supabase insert error:", error);

      // Handle unique constraint violation
      if (error.code === "23505") {
        return {
          success: false,
          error: "Dieses Kennzeichen ist bereits registriert.",
        };
      }

      return {
        success: false,
        error: "Fehler beim Registrieren des Kennzeichens.",
      };
    }

    return { success: true };
  } catch (err) {
    console.error("Unexpected error:", err);
    return {
      success: false,
      error: "Ein unerwarteter Fehler ist aufgetreten.",
    };
  }
}
