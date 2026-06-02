"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "./actions";

const initialState = { error: null as string | null, success: false };

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <div className="flex min-h-screen flex-col bg-linear-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
      <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col items-center gap-1 px-4 py-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">PlateDrop</h1>
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Passwort zurücksetzen
          </p>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-1 text-xl font-bold text-slate-900 dark:text-white">
            Passwort vergessen?
          </h2>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
            Wir senden dir einen Link zum Zurücksetzen deines Passworts.
          </p>

          {state.success ? (
            <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Falls diese E-Mail-Adresse registriert ist, erhältst du in Kürze eine E-Mail mit einem Link.
              </p>
            </div>
          ) : (
            <form action={action} className="flex flex-col gap-4">
              {state.error && (
                <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">{state.error}</p>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="email"
                  className="text-sm font-semibold text-slate-900 dark:text-white"
                >
                  E-Mail-Adresse
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@example.com"
                  disabled={pending}
                  className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 transition-colors disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500"
                />
              </div>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-slate-900 px-6 py-2 font-semibold text-white transition-all disabled:bg-slate-400 dark:bg-white dark:text-slate-900 dark:disabled:bg-slate-400"
              >
                {pending ? "Wird gesendet…" : "Link senden"}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            <Link
              href="/login"
              className="font-medium text-slate-900 underline dark:text-white"
            >
              Zurück zum Login
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
