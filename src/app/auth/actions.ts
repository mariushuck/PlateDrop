"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signUp(
  _prevState: { success: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const email = formData.get("email") as string;
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
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      console.error("Signup error:", error);
      return { success: false, error: error.message };
    }

    if (data.user) {
      // Create profile entry for the new user
      await supabase.from("profiles").insert({
        id: data.user.id,
        email: data.user.email,
      });
    }

    return { success: true };
  } catch (err) {
    console.error("Unexpected signup error:", err);
    return {
      success: false,
      error: "Ein unerwarteter Fehler ist aufgetreten.",
    };
  }
}

export async function signIn(
  _prevState: { success: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { success: false, error: "E-Mail und Passwort erforderlich." };
  }

  try {
    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("Sign in error:", error);
      return {
        success: false,
        error: "Ungültige E-Mail oder Passwort.",
      };
    }

    redirect("/dashboard");
  } catch (err) {
    console.error("Unexpected sign in error:", err);
    return {
      success: false,
      error: "Ein unerwarteter Fehler ist aufgetreten.",
    };
  }
}

export async function signOut() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/");
  } catch (err) {
    console.error("Sign out error:", err);
  }
}
