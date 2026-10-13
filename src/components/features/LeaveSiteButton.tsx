"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { leaveSiteAction } from "@/app/dashboard/actions";

/** Austritt in zwei Schritten; ein offener Antrag wird einfach zurückgezogen. */
export default function LeaveSiteButton({ siteId, pending }: { siteId: string; pending: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function leave() {
    startTransition(async () => {
      const result = await leaveSiteAction(siteId);
      if (!result.success) setError(result.error ?? "Austritt fehlgeschlagen");
      else router.refresh();
    });
  }

  return (
    <span className="ml-3 inline-flex flex-wrap items-center gap-2">
      {confirming ? (
        <>
          <button
            type="button"
            disabled={isPending}
            onClick={leave}
            className="font-semibold text-red-700 underline disabled:opacity-50 dark:text-red-300"
          >
            {pending ? "Antrag wirklich zurückziehen" : "Wirklich austreten"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="text-slate-500">
            Abbrechen
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-slate-500 underline dark:text-slate-400"
        >
          {pending ? "Zurückziehen" : "Austreten"}
        </button>
      )}
      {error && (
        <span className="text-red-800 dark:text-red-200" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
