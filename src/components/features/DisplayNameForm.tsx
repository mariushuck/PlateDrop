"use client";

import { useActionState } from "react";
import { changeDisplayName } from "@/app/dashboard/settings/actions";

const initialState = { error: null as string | null, success: false };

/** Anzeigename für Organisationen, die angemeldete Absender sichtbar machen. */
export default function DisplayNameForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState(changeDisplayName, initialState);

  return (
    <section>
      <h2 className="section-header">Anzeigename</h2>
      <form action={action} className="inset-group flex flex-col gap-3 p-4">
        <input
          name="name"
          defaultValue={current}
          maxLength={50}
          disabled={pending}
          aria-label="Anzeigename"
          placeholder="z. B. Erika M."
          className="field"
        />
        {state.error && (
          <p className="text-[15px] text-danger" role="alert">
            {state.error}
          </p>
        )}
        {state.success && <p className="text-[15px] text-success">Gespeichert.</p>}
        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          Speichern
        </button>
      </form>
      <p className="section-footer">
        Sichtbar nur, wenn du über ein Gelände schreibst, dessen Verwaltung Absender anzeigt. Leer
        bleibst du „Mitglied“. Anonyme Nachrichten tragen nie einen Namen.
      </p>
    </section>
  );
}
