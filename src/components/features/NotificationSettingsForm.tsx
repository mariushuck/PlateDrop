"use client";

import { useActionState } from "react";
import { saveNotificationSettingsAction } from "@/app/dashboard/settings/actions";
import type { NotificationSettings } from "@/lib/db/types";
import { MESSAGE_TYPES } from "@/lib/messages/catalog";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const URGENT = MESSAGE_TYPES.filter((type) => type.urgent)
  .map((type) => type.label)
  .join(", ");
const initialState = { error: null as string | null, success: false };

/** E-Mail-Benachrichtigungen und Ruhezeiten (volle Stunden, deutsche Zeit). */
export default function NotificationSettingsForm({ initial }: { initial: NotificationSettings }) {
  const [state, action, pending] = useActionState(saveNotificationSettingsAction, initialState);
  const selectClass =
    "rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-slate-900 disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
        Benachrichtigungen
      </h2>
      <form action={action} className="flex flex-col gap-4">
        <label className="flex items-center gap-3 text-sm text-slate-900 dark:text-white">
          <input
            type="checkbox"
            name="emailEnabled"
            defaultChecked={initial.email_enabled}
            disabled={pending}
            className="h-5 w-5"
          />
          E-Mail bei neuen Nachrichten
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-slate-900 dark:text-white">
            Ruhezeiten
          </legend>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            In dieser Zeit kommen nur dringende Nachrichten sofort ({URGENT}). Alles andere folgt
            danach.
          </p>
          <div className="flex items-center gap-2 text-sm text-slate-900 dark:text-white">
            <select
              name="quietStart"
              aria-label="Ruhezeit ab"
              defaultValue={initial.quiet_start ?? ""}
              disabled={pending}
              className={selectClass}
            >
              <option value="">keine</option>
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {hour}:00
                </option>
              ))}
            </select>
            bis
            <select
              name="quietEnd"
              aria-label="Ruhezeit bis"
              defaultValue={initial.quiet_end ?? ""}
              disabled={pending}
              className={selectClass}
            >
              <option value="">keine</option>
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {hour}:00
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        {state.error && (
          <p className="text-sm font-medium text-red-800 dark:text-red-200" role="alert">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="text-sm font-medium text-green-800 dark:text-green-200">Gespeichert.</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white disabled:bg-slate-400 dark:bg-white dark:text-slate-900"
        >
          {pending ? "Wird gespeichert..." : "Speichern"}
        </button>
      </form>
    </section>
  );
}
