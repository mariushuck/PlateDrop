"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizePlate, validateGermanPlate } from "@/lib/utils/plateUtils";

/**
 * Generate a random 6-character verification code in format "XX-XXXX"
 * Example: "PD-8X4A"
 */
function generateVerificationCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${code.slice(0, 2)}-${code.slice(2)}`;
}

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
    // Generate verification code
    const verificationCode = generateVerificationCode();

    // Insert into verified_plates with pending status
    const { error } = await supabase.from("verified_plates").insert({
      user_id: userData.user.id,
      plate_number: normalizedPlate,
      is_verified: false,
      verification_status: "pending",
      verification_code: verificationCode,
      proof_image_url: null,
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

export async function uploadProof(
  plateId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string; url?: string }> {
  // Get authenticated user
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return {
      success: false,
      error: "Sie müssen angemeldet sein.",
    };
  }

  try {
    // Extract file from form data
    const file = formData.get("proof") as File;

    if (!file) {
      return {
        success: false,
        error: "Bitte wählen Sie ein Bild aus.",
      };
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return {
        success: false,
        error: "Bitte wählen Sie ein gültiges Bildformat.",
      };
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return {
        success: false,
        error: "Die Datei ist zu groß. Maximum 5MB.",
      };
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `${plateId}-${timestamp}-${file.name}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("proofs")
      .upload(fileName, file);

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return {
        success: false,
        error: "Fehler beim Hochladen des Bildes.",
      };
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("proofs").getPublicUrl(fileName);

    // Update verified_plates with proof image URL
    const { error: updateError } = await supabase
      .from("verified_plates")
      .update({
        proof_image_url: publicUrl,
      })
      .eq("id", plateId)
      .eq("user_id", userData.user.id);

    if (updateError) {
      console.error("Update error:", updateError);
      return {
        success: false,
        error: "Fehler beim Speichern der Bildadresse.",
      };
    }

    return { success: true, url: publicUrl };
  } catch (err) {
    console.error("Unexpected error:", err);
    return {
      success: false,
      error: "Ein unerwarteter Fehler ist aufgetreten.",
    };
  }
}
