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
          className="btn btn-sm btn-danger flex-1"
        >
          Nachricht löschen
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => resolveReportAction(reportId))}
          className="btn btn-sm btn-secondary flex-1"
        >
          Behalten
        </button>
      </div>
      {error && (
        <p className="text-[15px] text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
