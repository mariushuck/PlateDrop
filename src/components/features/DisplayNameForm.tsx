"use client";

import { useActionState } from "react";
import { changeDisplayName } from "@/app/dashboard/settings/actions";

const initialState = { error: null as string | null, success: false };

/** Anzeigename für Organisationen, die angemeldete Absender sichtbar machen. */
export default function DisplayNameForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState(changeDisplayName, initialState);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">Anzeigename</h2>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        Sichtbar nur, wenn du über ein Gelände schreibst, dessen Verwaltung Absender anzeigt. Leer
        bleibst du „Mitglied“. Anonyme Nachrichten tragen nie einen Namen.
      </p>
      <form action={action} className="flex flex-col gap-3">
        <input
          name="name"
          defaultValue={current}
          maxLength={50}
          disabled={pending}
          aria-label="Anzeigename"
          placeholder="z. B. Erika M."
          className="rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-slate-900 disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
        />
        {state.error && (
          <p className="text-sm text-red-800 dark:text-red-200" role="alert">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="text-sm text-green-800 dark:text-green-200">Gespeichert.</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-lg bg-slate-900 px-6 py-2 font-semibold text-white disabled:bg-slate-400 dark:bg-white dark:text-slate-900"
        >
          Speichern
        </button>
      </form>
    </section>
  );
}
