"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizePlate, validateGermanPlate } from "@/lib/utils/plateUtils";

export async function dropMessage(
  _prevState: { success: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const plateNumber = formData.get("plateNumber") as string;
  const messageText = formData.get("messageText") as string;

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

  // Validate message
  if (!messageText || !messageText.trim()) {
    return { success: false, error: "Nachricht darf nicht leer sein." };
  }

  if (messageText.length > 500) {
    return {
      success: false,
      error: "Nachricht darf nicht länger als 500 Zeichen sein.",
    };
  }

  // Normalize plate and insert
  const normalizedPlate = normalizePlate(plateNumber);

  try {
    const supabase = await createClient();

    const { error } = await supabase.from("messages").insert({
      plate_number: normalizedPlate,
      message_text: messageText.trim(),
    });

    if (error) {
      console.error("Supabase insert error:", error);
      return {
        success: false,
        error:
          "Fehler beim Speichern der Nachricht. Bitte versuchen Sie es später erneut.",
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
