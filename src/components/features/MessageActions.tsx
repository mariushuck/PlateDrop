"use client";

import { EyeOff, Flag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { hideMessageAction, reportMessageAction } from "@/app/dashboard/actions";
import { REPORT_REASONS } from "@/lib/messages/reportReasons";

/** Ausblenden und Melden einer einzelnen Nachricht im Dashboard. */
export default function MessageActions({ messageId }: { messageId: string }) {
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? "Aktion fehlgeschlagen");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-2">
      {reporting ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Grund der Meldung
          </p>
          <div className="flex flex-wrap gap-2">
            {REPORT_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                disabled={isPending}
                onClick={() => run(() => reportMessageAction(messageId, reason))}
                className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50 dark:border-red-700 dark:text-red-300"
              >
                {reason}
              </button>
            ))}
            <button
              type="button"
              disabled={isPending}
              onClick={() => setReporting(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 dark:text-slate-400"
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-4">
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => hideMessageAction(messageId))}
            className="flex items-center gap-1.5 py-1 text-sm font-medium text-slate-500 disabled:opacity-50 dark:text-slate-400"
          >
            <EyeOff className="h-4 w-4" />
            Ausblenden
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setReporting(true)}
            className="flex items-center gap-1.5 py-1 text-sm font-medium text-slate-500 disabled:opacity-50 dark:text-slate-400"
          >
            <Flag className="h-4 w-4" />
            Melden
          </button>
        </div>
      )}
      {error && (
        <p className="text-sm text-red-800 dark:text-red-200" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
