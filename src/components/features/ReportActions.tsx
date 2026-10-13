"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteReportedMessageAction, resolveReportAction } from "@/app/admin/actions";

/** Entscheidung über eine Meldung: Nachricht löschen oder Meldung schließen. */
export default function ReportActions({
  reportId,
  messageId,
}: {
  reportId: string;
  messageId: string;
}) {
  const router = useRouter();
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
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => deleteReportedMessageAction(messageId))}
          className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Nachricht löschen
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => resolveReportAction(reportId))}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
        >
          Behalten
        </button>
      </div>
      {error && (
        <p className="text-sm text-red-800 dark:text-red-200" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
