"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signIn, signUp } from "@/app/auth/actions";

type AuthMode = "signin" | "signup";

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [signUpState, signUpAction, isSignUpPending] = useActionState(signUp, null);
  const [signInState, signInAction, isSignInPending] = useActionState(signIn, null);

  const isPending = isSignUpPending || isSignInPending;
  const currentState = mode === "signup" ? signUpState : signInState;
  const currentAction = mode === "signup" ? signUpAction : signInAction;

  return (
    <div className="flex min-h-screen flex-col bg-linear-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col items-center gap-1 px-4 py-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">PlateDrop</h1>
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Kennzeichen verifizieren und Nachrichten lesen
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          {/* Mode Tabs */}
          <div className="mb-6 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-lg px-4 py-2 font-semibold transition-colors ${
                mode === "signin"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
              }`}
            >
              Anmelden
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-lg px-4 py-2 font-semibold transition-colors ${
                mode === "signup"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
              }`}
            >
              Registrieren
            </button>
          </div>

          {/* Form */}
          <form action={currentAction} className="flex flex-col gap-4">
            {/* Email Input */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="email"
                className="text-sm font-semibold text-slate-900 dark:text-white"
              >
                E-Mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="name@example.com"
                disabled={isPending}
                className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 transition-colors disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500"
              />
            </div>

            {/* Password Input */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="password"
                className="text-sm font-semibold text-slate-900 dark:text-white"
              >
                Passwort
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                placeholder={mode === "signup" ? "Mindestens 6 Zeichen" : "Dein Passwort"}
                disabled={isPending}
                className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 transition-colors disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500"
              />
            </div>

            {/* Error Display */}
            {currentState?.error && (
              <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  {currentState.error}
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-slate-900 px-6 py-2 font-semibold text-white transition-all disabled:bg-slate-400 dark:bg-white dark:text-slate-900 dark:disabled:bg-slate-400"
            >
              {isPending
                ? mode === "signup"
                  ? "Wird registriert..."
                  : "Wird angemeldet..."
                : mode === "signup"
                  ? "Registrieren"
                  : "Anmelden"}
            </button>
          </form>

          {/* Forgot Password */}
          {mode === "signin" && (
            <p className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">
              <Link href="/forgot-password" className="underline hover:text-slate-900 dark:hover:text-white">
                Passwort vergessen?
              </Link>
            </p>
          )}

          {/* Help Text */}
          <p className="mt-4 text-center text-xs text-slate-600 dark:text-slate-400">
            {mode === "signup"
              ? "Nach der Registrierung können Sie Ihr Kennzeichen verifizieren."
              : "Melden Sie sich an, um Ihre Kennzeichen zu verwalten."}
          </p>
        </div>
      </main>
    </div>
  );
}
