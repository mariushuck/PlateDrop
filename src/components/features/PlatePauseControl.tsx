"use client";

import { BellOff, BellRing } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setPlatePauseAction } from "@/app/dashboard/actions";

const OPTIONS = [
  { hours: 1, label: "1 Std." },
  { hours: 8, label: "8 Std." },
  { hours: 24, label: "1 Tag" },
  { hours: 168, label: "1 Woche" },
];

/** Benachrichtigungen für ein Kennzeichen pausieren oder fortsetzen. */
export default function PlatePauseControl({
  plateId,
  pausedUntil,
}: {
  plateId: string;
  pausedUntil: string | null;
}) {
  const router = useRouter();
  const [choosing, setChoosing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(hours: number | null) {
    setError(null);
    startTransition(async () => {
      const result = await setPlatePauseAction(plateId, hours);
      if (!result.success) {
        setError(result.error ?? "Aktion fehlgeschlagen");
        return;
      }
      setChoosing(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 text-[15px]">
      {pausedUntil ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-secondary">
            <BellOff className="h-4 w-4" />
            Benachrichtigungen pausiert bis{" "}
            {new Date(pausedUntil).toLocaleString("de-DE", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(null)}
            className="text-tint active:opacity-60 disabled:opacity-40"
          >
            Fortsetzen
          </button>
        </div>
      ) : choosing ? (
        <div className="space-y-2">
          <div className="segmented">
            {OPTIONS.map((option) => (
              <button
                key={option.hours}
                type="button"
                disabled={isPending}
                onClick={() => run(option.hours)}
                className="disabled:opacity-40"
              >
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setChoosing(false)} className="text-tint">
            Abbrechen
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setChoosing(true)}
          className="flex items-center gap-1.5 text-tint active:opacity-60"
        >
          <BellRing className="h-4 w-4" />
          Benachrichtigungen pausieren
        </button>
      )}
      {error && (
        <p className="text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
