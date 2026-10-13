"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removePlate } from "@/app/dashboard/actions";

/**
 * Entfernen in zwei Schritten: der erste Tipp fragt nach, erst der zweite
 * löscht. Kein Hover-Zustand, damit es auf dem Handy gleich funktioniert.
 */
export default function RemovePlateButton({ plateId }: { plateId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removePlate(plateId);
      if (!result.success) {
        setError(result.error ?? "Fehler beim Entfernen");
        setConfirming(false);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-2">
      {confirming ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isPending ? "Wird entfernt..." : "Wirklich entfernen"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
          >
            Abbrechen
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400"
        >
          <Trash2 className="h-4 w-4" />
          Kennzeichen entfernen
        </button>
      )}
      {error && (
        <p className="text-sm text-red-800 dark:text-red-200" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
