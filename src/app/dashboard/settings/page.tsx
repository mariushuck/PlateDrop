"use client";

import { useActionState, useState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/passwordPolicy";
import { changeEmail, changePassword, deleteAccount, exportMyData } from "./actions";

const pwInit = { error: null as string | null, success: false };
const emailInit = { error: null as string | null, success: false };
const deleteInit = { error: null as string | null };

export default function SettingsPage() {
  const [pwState, pwAction, pwPending] = useActionState(changePassword, pwInit);
  const [emailState, emailAction, emailPending] = useActionState(changeEmail, emailInit);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteAccount, deleteInit);
  const [exportPending, setExportPending] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setExportError(null);
    setExportPending(true);
    try {
      const { filename, json } = await exportMyData();
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Export fehlgeschlagen. Bitte später erneut versuchen.");
    } finally {
      setExportPending(false);
    }
  }

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
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  {pwState.error}
                </p>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="pw-current"
                className="text-sm font-semibold text-slate-900 dark:text-white"
              >
                Aktuelles Passwort
              </label>
              <input
                id="pw-current"
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
                disabled={pwPending}
                className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 transition-colors disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="pw-new"
                className="text-sm font-semibold text-slate-900 dark:text-white"
              >
                Neues Passwort
              </label>
              <input
                id="pw-new"
                name="password"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                placeholder={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}
                autoComplete="new-password"
                disabled={pwPending}
                className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 transition-colors disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="pw-confirm"
                className="text-sm font-semibold text-slate-900 dark:text-white"
              >
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
          Wir senden eine Bestätigungs-E-Mail an deine bisherige Adresse.
        </p>
        {emailState.success ? (
          <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Bestätigungs-E-Mail an deine bisherige Adresse gesendet.
            </p>
          </div>
        ) : (
          <form action={emailAction} className="flex flex-col gap-4">
            {emailState.error && (
              <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  {emailState.error}
                </p>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="email"
                className="text-sm font-semibold text-slate-900 dark:text-white"
              >
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

      {/* Datenexport (DSGVO Art. 15/20) */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">
          Meine Daten exportieren
        </h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Lädt deine Kontodaten, Kennzeichen und die Nachrichten an deine verifizierten Kennzeichen
          als JSON-Datei herunter.
        </p>
        {exportError && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">{exportError}</p>
          </div>
        )}
        <button
          type="button"
          onClick={handleExport}
          disabled={exportPending}
          className="self-start rounded-lg bg-slate-900 px-6 py-2 font-semibold text-white transition-all disabled:bg-slate-400 dark:bg-white dark:text-slate-900 dark:disabled:bg-slate-400"
        >
          {exportPending ? "Wird erstellt…" : "Export herunterladen"}
        </button>
      </section>

      {/* Konto löschen */}
      <section className="rounded-lg border border-red-300 bg-white p-6 shadow-sm dark:border-red-800 dark:bg-slate-800">
        <h2 className="mb-1 text-lg font-semibold text-red-700 dark:text-red-400">Konto löschen</h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Entfernt dein Konto, deine Kennzeichen und die dazugehörigen Beweisfotos unwiderruflich.
          Anonyme Nachrichten an fremde Kennzeichen bleiben erhalten.
        </p>
        <form action={deleteAction} className="flex flex-col gap-4">
          {deleteState.error && (
            <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {deleteState.error}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="delete-password"
              className="text-sm font-semibold text-slate-900 dark:text-white"
            >
              Passwort zur Bestätigung
            </label>
            <input
              id="delete-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              disabled={deletePending}
              className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400 transition-colors disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-slate-500"
            />
          </div>
          <button
            type="submit"
            disabled={deletePending}
            className="self-start rounded-lg bg-red-600 px-6 py-2 font-semibold text-white transition-all hover:bg-red-700 disabled:bg-red-300"
          >
            {deletePending ? "Wird gelöscht…" : "Konto endgültig löschen"}
          </button>
        </form>
      </section>
    </div>
  );
}
