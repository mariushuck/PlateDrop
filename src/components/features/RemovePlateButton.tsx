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
    <div className="space-y-2">
      {confirming ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            className="btn btn-sm btn-danger flex-1"
          >
            {isPending ? "Wird entfernt..." : "Wirklich entfernen"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="btn btn-sm btn-secondary flex-1"
          >
            Abbrechen
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex items-center gap-1.5 text-[15px] text-danger active:opacity-60"
        >
          <Trash2 className="h-4 w-4" />
          Kennzeichen entfernen
        </button>
      )}
      {error && (
        <p className="text-[15px] text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
