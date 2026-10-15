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
    <span className="inline-flex flex-wrap items-center gap-3 text-[15px]">
      {confirming ? (
        <>
          <button
            type="button"
            disabled={isPending}
            onClick={leave}
            className="font-semibold text-danger disabled:opacity-40"
          >
            {pending ? "Antrag wirklich zurückziehen" : "Wirklich austreten"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="text-tint">
            Abbrechen
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-danger active:opacity-60"
        >
          {pending ? "Zurückziehen" : "Austreten"}
        </button>
      )}
      {error && (
        <span className="text-danger" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
