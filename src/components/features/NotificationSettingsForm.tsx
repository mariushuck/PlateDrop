"use client";

import { useActionState } from "react";
import { saveNotificationSettingsAction } from "@/app/dashboard/settings/actions";
import type { NotificationSettings } from "@/lib/db/types";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const initialState = { error: null as string | null, success: false };

/** E-Mail-Benachrichtigungen und Ruhezeiten (volle Stunden, deutsche Zeit). */
export default function NotificationSettingsForm({ initial }: { initial: NotificationSettings }) {
  const [state, action, pending] = useActionState(saveNotificationSettingsAction, initialState);

  return (
    <section>
      <h2 className="section-header">Benachrichtigungen</h2>
      <form action={action} className="inset-group">
        <label className="list-row cursor-pointer justify-between text-[17px]">
          E-Mail bei neuen Nachrichten
          <input
            type="checkbox"
            name="emailEnabled"
            defaultChecked={initial.email_enabled}
            disabled={pending}
            className="switch"
          />
        </label>

        <fieldset className="list-row flex-col items-stretch gap-2">
          <legend className="sr-only">Ruhezeiten</legend>
          <div className="flex items-center justify-between gap-3 text-[17px]">
            <span aria-hidden="true">Ruhezeiten</span>
            <div className="flex items-center gap-2 text-[15px] text-secondary">
              <select
                name="quietStart"
                aria-label="Ruhezeit ab"
                defaultValue={initial.quiet_start ?? ""}
                disabled={pending}
                className="field min-h-9 py-1.5"
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
                className="field min-h-9 py-1.5"
              >
                <option value="">keine</option>
                {HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {hour}:00
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        <div className="list-row flex-col items-stretch gap-2">
          {state.error && (
            <p className="text-[15px] text-danger" role="alert">
              {state.error}
            </p>
          )}
          {state.success && <p className="text-[15px] text-success">Gespeichert.</p>}
          <button type="submit" disabled={pending} className="btn btn-primary w-full">
            {pending ? "Wird gespeichert..." : "Speichern"}
          </button>
        </div>
      </form>
      <p className="section-footer">
        In den Ruhezeiten kommen nur dringende Hinweise sofort, z. B. Licht an, Alarmanlage oder
        blockierte Ausfahrt. Alles andere folgt danach.
      </p>
    </section>
  );
}
