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
    <div className="mt-2 space-y-2">
      {reporting ? (
        <div className="space-y-2">
          <p className="text-[13px] text-secondary">Grund der Meldung</p>
          <div className="flex flex-wrap gap-2">
            {REPORT_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                disabled={isPending}
                onClick={() => run(() => reportMessageAction(messageId, reason))}
                className="btn btn-sm btn-danger"
              >
                {reason}
              </button>
            ))}
            <button
              type="button"
              disabled={isPending}
              onClick={() => setReporting(false)}
              className="btn btn-sm btn-plain"
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-5">
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => hideMessageAction(messageId))}
            className="flex items-center gap-1.5 py-1 text-[15px] text-tint active:opacity-60 disabled:opacity-40"
          >
            <EyeOff className="h-4 w-4" />
            Ausblenden
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setReporting(true)}
            className="flex items-center gap-1.5 py-1 text-[15px] text-tint active:opacity-60 disabled:opacity-40"
          >
            <Flag className="h-4 w-4" />
            Melden
          </button>
        </div>
      )}
      {error && (
        <p className="text-[15px] text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
