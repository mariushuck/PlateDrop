"use client";

import Link from "next/link";
import { use, useActionState, useState } from "react";
import { signIn, signUp } from "@/app/auth/actions";
import NavBar from "@/components/ui/NavBar";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/passwordPolicy";

type AuthMode = "signin" | "signup";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Rückweg zum Standort-Formular; geprüft wird er in der Server Action.
  const next = use(searchParams).next;
  const [mode, setMode] = useState<AuthMode>("signin");
  const [signUpState, signUpAction, isSignUpPending] = useActionState(signUp, null);
  const [signInState, signInAction, isSignInPending] = useActionState(signIn, null);

  const isPending = isSignUpPending || isSignInPending;
  const currentState = mode === "signup" ? signUpState : signInState;
  const currentAction = mode === "signup" ? signUpAction : signInAction;

  return (
    <div className="flex flex-1 flex-col">
      <NavBar>
        <Link href="/" className="text-[17px] font-semibold active:opacity-60">
          PlateDrop
        </Link>
      </NavBar>

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-4 pt-6 pb-8">
        <h1 className="large-title">{mode === "signup" ? "Registrieren" : "Anmelden"}</h1>
        <p className="mt-1 mb-6 text-[17px] text-secondary">
          {mode === "signup"
            ? "Nach der Registrierung kannst du dein Kennzeichen verifizieren."
            : "Kennzeichen verwalten und Nachrichten lesen."}
        </p>

        <div className="segmented mb-6">
          <button type="button" aria-pressed={mode === "signin"} onClick={() => setMode("signin")}>
            Anmelden
          </button>
          <button type="button" aria-pressed={mode === "signup"} onClick={() => setMode("signup")}>
            Registrieren
          </button>
        </div>

        {/* Registrierung erfolgreich: Die Adresse muss erst bestätigt werden,
            bevor eine Anmeldung möglich ist. Ohne diesen Hinweis stünde der
            Nutzer vor einem Login, das noch nicht funktionieren kann. */}
        {mode === "signup" && signUpState?.success ? (
          <div className="inset-group p-4 text-[15px]" role="status">
            <p className="font-semibold text-success">
              Fast geschafft: Wir haben dir eine Bestätigungs-E-Mail geschickt.
            </p>
            <p className="mt-2">Klicke den Link darin an, danach kannst du dich anmelden.</p>
          </div>
        ) : (
          <form action={currentAction} className="flex flex-col gap-4">
            {typeof next === "string" && <input type="hidden" name="next" value={next} />}
            <div className="inset-group flex flex-col gap-4 p-4">
              <div>
                <label htmlFor="email" className="field-label">
                  E-Mail
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@example.com"
                  disabled={isPending}
                  className="field"
                />
              </div>
              <div>
                <label htmlFor="password" className="field-label">
                  Passwort
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder={
                    mode === "signup"
                      ? `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`
                      : "Dein Passwort"
                  }
                  disabled={isPending}
                  className="field"
                />
              </div>
            </div>

            {currentState?.error && (
              <p role="alert" className="px-1 text-[15px] text-danger">
                {currentState.error}
              </p>
            )}

            <button type="submit" disabled={isPending} className="btn btn-primary w-full">
              {isPending
                ? mode === "signup"
                  ? "Wird registriert..."
                  : "Wird angemeldet..."
                : mode === "signup"
                  ? "Registrieren"
                  : "Anmelden"}
            </button>
          </form>
        )}

        {mode === "signin" && (
          <Link href="/forgot-password" className="btn-plain mt-5 self-center text-[15px]">
            Passwort vergessen?
          </Link>
        )}
      </main>
    </div>
  );
}
