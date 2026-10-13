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
    <div className="mt-2 space-y-2 text-sm">
      {pausedUntil ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
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
            className="font-medium text-slate-900 underline disabled:opacity-50 dark:text-white"
          >
            Fortsetzen
          </button>
        </div>
      ) : choosing ? (
        <div className="flex flex-wrap gap-2">
          {OPTIONS.map((option) => (
            <button
              key={option.hours}
              type="button"
              disabled={isPending}
              onClick={() => run(option.hours)}
              className="rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setChoosing(false)}
            className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400"
          >
            Abbrechen
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setChoosing(true)}
          className="flex items-center gap-1.5 font-medium text-slate-500 dark:text-slate-400"
        >
          <BellRing className="h-4 w-4" />
          Benachrichtigungen pausieren
        </button>
      )}
      {error && (
        <p className="text-red-800 dark:text-red-200" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
