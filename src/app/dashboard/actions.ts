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
  if (!plateNumber?.trim()) {
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

    // Build a user-scoped object path so the bucket's owner RLS matches on the
    // "<user_id>/" prefix. The bucket is private; the raw path is never public.
    const timestamp = Date.now();
    const extension = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const objectPath = `${userData.user.id}/${plateId}-${timestamp}.${extension}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage.from("proofs").upload(objectPath, file);

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return {
        success: false,
        error: "Fehler beim Hochladen des Bildes.",
      };
    }

    // Store the object path (not a public URL) — proofs are read via signed URLs.
    const { error: updateError } = await supabase
      .from("verified_plates")
      .update({
        proof_image_url: objectPath,
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

    return { success: true, url: objectPath };
  } catch (err) {
    console.error("Unexpected error:", err);
    return {
      success: false,
      error: "Ein unerwarteter Fehler ist aufgetreten.",
    };
  }
}
