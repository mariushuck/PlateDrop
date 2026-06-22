"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizePlate, validateGermanPlate } from "@/lib/utils/plateUtils";
import { getClientIpHash } from "@/lib/utils/rateLimit";

const RATE_LIMIT_ERROR = "Zu viele Anfragen. Bitte versuchen Sie es in einigen Minuten erneut.";

export async function dropMessage(
  _prevState: { success: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const plateNumber = formData.get("plateNumber") as string;
  const messageText = formData.get("messageText") as string;

  // Validate plate
  if (!plateNumber?.trim()) {
    return { success: false, error: "Bitte geben Sie ein Kennzeichen ein." };
  }

  if (!validateGermanPlate(plateNumber)) {
    return {
      success: false,
      error: "Ungültiges deutsches Kennzeichen. Beispiel: KA-AB-1234",
    };
  }

  // Validate message
  if (!messageText?.trim()) {
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

    // Per-IP rate limit (pseudonymized). Allowed when no IP can be determined;
    // the per-plate DB trigger still applies as a backstop.
    const ipHash = await getClientIpHash();
    const { data: allowed, error: rateError } = await supabase.rpc("check_message_rate", {
      p_ip_hash: ipHash,
    });

    if (rateError) {
      console.error("Rate limit check error:", rateError);
      return {
        success: false,
        error: "Fehler beim Speichern der Nachricht. Bitte versuchen Sie es später erneut.",
      };
    }

    if (allowed === false) {
      return { success: false, error: RATE_LIMIT_ERROR };
    }

    const { error } = await supabase.from("messages").insert({
      plate_number: normalizedPlate,
      message_text: messageText.trim(),
    });

    if (error) {
      console.error("Supabase insert error:", error);

      // Raised by the per-plate rate-limit trigger (SQLSTATE 23514).
      if (error.code === "23514") {
        return { success: false, error: RATE_LIMIT_ERROR };
      }

      return {
        success: false,
        error: "Fehler beim Speichern der Nachricht. Bitte versuchen Sie es später erneut.",
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
