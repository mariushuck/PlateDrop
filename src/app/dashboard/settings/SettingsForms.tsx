"use client";

import { useActionState, useState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/passwordPolicy";
import { changeEmail, changePassword, deleteAccount, exportMyData } from "./actions";

const pwInit = { error: null as string | null, success: false };
const emailInit = { error: null as string | null, success: false };
const deleteInit = { error: null as string | null };

/** Konto-Formulare der Einstellungsseite (Passwort, E-Mail, Export, Löschung). */
export default function SettingsForms() {
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
    <div className="space-y-9">
      <section>
        <h2 className="section-header">Passwort ändern</h2>
        {pwState.success ? (
          <p className="inset-group p-4 text-[15px] text-success" role="status">
            Passwort erfolgreich aktualisiert.
          </p>
        ) : (
          <form action={pwAction} className="inset-group flex flex-col gap-4 p-4">
            <div>
              <label htmlFor="pw-current" className="field-label">
                Aktuelles Passwort
              </label>
              <input
                id="pw-current"
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
                disabled={pwPending}
                className="field"
              />
            </div>
            <div>
              <label htmlFor="pw-new" className="field-label">
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
                className="field"
              />
            </div>
            <div>
              <label htmlFor="pw-confirm" className="field-label">
                Passwort bestätigen
              </label>
              <input
                id="pw-confirm"
                name="confirm"
                type="password"
                required
                autoComplete="new-password"
                disabled={pwPending}
                className="field"
              />
            </div>
            {pwState.error && (
              <p className="text-[15px] text-danger" role="alert">
                {pwState.error}
              </p>
            )}
            <button type="submit" disabled={pwPending} className="btn btn-primary w-full">
              {pwPending ? "Wird gespeichert…" : "Passwort speichern"}
            </button>
          </form>
        )}
      </section>

      <section>
        <h2 className="section-header">E-Mail-Adresse ändern</h2>
        {emailState.success ? (
          <p className="inset-group p-4 text-[15px] text-success" role="status">
            Bestätigungs-E-Mail an deine bisherige Adresse gesendet.
          </p>
        ) : (
          <form action={emailAction} className="inset-group flex flex-col gap-4 p-4">
            <div>
              <label htmlFor="email" className="field-label">
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
                className="field"
              />
            </div>
            {emailState.error && (
              <p className="text-[15px] text-danger" role="alert">
                {emailState.error}
              </p>
            )}
            <button type="submit" disabled={emailPending} className="btn btn-primary w-full">
              {emailPending ? "Wird gesendet…" : "E-Mail ändern"}
            </button>
          </form>
        )}
        <p className="section-footer">
          Wir senden eine Bestätigungs-E-Mail an deine bisherige Adresse.
        </p>
      </section>

      {/* Datenexport (DSGVO Art. 15/20) */}
      <section>
        <h2 className="section-header">Meine Daten</h2>
        <div className="inset-group">
          <button
            type="button"
            onClick={handleExport}
            disabled={exportPending}
            className="list-row w-full text-left text-[17px] text-tint active:opacity-60 disabled:opacity-40"
          >
            {exportPending ? "Wird erstellt…" : "Export herunterladen"}
          </button>
        </div>
        {exportError ? (
          <p className="section-footer text-danger" role="alert">
            {exportError}
          </p>
        ) : (
          <p className="section-footer">
            Lädt deine Kontodaten, Kennzeichen und die Nachrichten an deine verifizierten
            Kennzeichen als JSON-Datei herunter.
          </p>
        )}
      </section>

      <section>
        <h2 className="section-header">Konto löschen</h2>
        <form action={deleteAction} className="inset-group flex flex-col gap-4 p-4">
          <div>
            <label htmlFor="delete-password" className="field-label">
              Passwort zur Bestätigung
            </label>
            <input
              id="delete-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              disabled={deletePending}
              className="field"
            />
          </div>
          {deleteState.error && (
            <p className="text-[15px] text-danger" role="alert">
              {deleteState.error}
            </p>
          )}
          <button type="submit" disabled={deletePending} className="btn btn-danger w-full">
            {deletePending ? "Wird gelöscht…" : "Konto endgültig löschen"}
          </button>
        </form>
        <p className="section-footer">
          Entfernt dein Konto, deine Kennzeichen und die dazugehörigen Beweisfotos unwiderruflich.
          Anonyme Nachrichten an fremde Kennzeichen bleiben erhalten.
        </p>
      </section>
    </div>
  );
}
