"use server";

import { createClient } from "@/lib/supabase/server";

export async function approvePlate(plateId: string): Promise<{ success: boolean; error?: string }> {
  // Get authenticated user
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return {
      success: false,
      error: "Sie müssen angemeldet sein.",
    };
  }

  // Check if user is admin
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profileData?.is_admin) {
    return {
      success: false,
      error: "Sie haben keine Berechtigung für diese Aktion.",
    };
  }

  try {
    const { error } = await supabase
      .from("verified_plates")
      .update({
        is_verified: true,
        verification_status: "approved",
      })
      .eq("id", plateId);

    if (error) {
      console.error("Supabase update error:", error);
      return {
        success: false,
        error: "Fehler beim Genehmigen des Kennzeichens.",
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

export async function rejectPlate(plateId: string): Promise<{ success: boolean; error?: string }> {
  // Get authenticated user
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return {
      success: false,
      error: "Sie müssen angemeldet sein.",
    };
  }

  // Check if user is admin
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profileData?.is_admin) {
    return {
      success: false,
      error: "Sie haben keine Berechtigung für diese Aktion.",
    };
  }

  try {
    const { error } = await supabase
      .from("verified_plates")
      .update({
        is_verified: false,
        verification_status: "rejected",
      })
      .eq("id", plateId);

    if (error) {
      console.error("Supabase update error:", error);
      return {
        success: false,
        error: "Fehler beim Ablehnen des Kennzeichens.",
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
