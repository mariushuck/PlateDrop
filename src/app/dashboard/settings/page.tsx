"use client";

import { useActionState } from "react";
import { changePassword, changeEmail } from "./actions";

const pwInit = { error: null as string | null, success: false };
const emailInit = { error: null as string | null, success: false };

export default function SettingsPage() {
  const [pwState, pwAction, pwPending] = useActionState(changePassword, pwInit);
  const [emailState, emailAction, emailPending] = useActionState(changeEmail, emailInit);

  return (
    <div className="mx-auto max-w-lg space-y-10 px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Einstellungen</h1>

      {/* Change Password */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Passwort ändern
        </h2>
        {pwState.success ? (
          <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Passwort erfolgreich aktualisiert.
            </p>
          </div>
        ) : (
          <form action={pwAction} className="flex flex-col gap-4">
            {pwState.error && (
              <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">{pwState.error}</p>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label htmlFor="pw-new" className="text-sm font-semibold text-slate-900 dark:text-white">
                Neues Passwort
              </label>
              <input
                id="pw-new"
                name="password"
                type="password"
                required
                minLength={6}
                placeholder="Mindestens 6 Zeichen"
                autoComplete="new-password"
                disabled={pwPending}
                className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 transition-colors disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="pw-confirm" className="text-sm font-semibold text-slate-900 dark:text-white">
                Passwort bestätigen
              </label>
              <input
                id="pw-confirm"
                name="confirm"
                type="password"
                required
                autoComplete="new-password"
                disabled={pwPending}
                className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 transition-colors disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500"
              />
            </div>
            <button
              type="submit"
              disabled={pwPending}
              className="self-start rounded-lg bg-slate-900 px-6 py-2 font-semibold text-white transition-all disabled:bg-slate-400 dark:bg-white dark:text-slate-900 dark:disabled:bg-slate-400"
            >
              {pwPending ? "Wird gespeichert…" : "Passwort speichern"}
            </button>
          </form>
        )}
      </section>

      {/* Change Email */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">
          E-Mail-Adresse ändern
        </h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Wir senden eine Bestätigungs-E-Mail an die neue Adresse.
        </p>
        {emailState.success ? (
          <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Bestätigungs-E-Mail gesendet. Bitte prüfe dein Postfach.
            </p>
          </div>
        ) : (
          <form action={emailAction} className="flex flex-col gap-4">
            {emailState.error && (
              <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">{emailState.error}</p>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-semibold text-slate-900 dark:text-white">
                Neue E-Mail-Adresse
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@example.com"
                disabled={emailPending}
                className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 transition-colors disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500"
              />
            </div>
            <button
              type="submit"
              disabled={emailPending}
              className="self-start rounded-lg bg-slate-900 px-6 py-2 font-semibold text-white transition-all disabled:bg-slate-400 dark:bg-white dark:text-slate-900 dark:disabled:bg-slate-400"
            >
              {emailPending ? "Wird gesendet…" : "E-Mail ändern"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
