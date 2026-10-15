"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Schaltfläche für eine gebundene Server Action (`action.bind(null, …)`), mit
 * optionaler Rückfrage. Für die Listen im Verwaltungsbereich.
 */
export default function ActionButton({
  action,
  label,
  confirmLabel,
  variant = "secondary",
}: {
  action: () => Promise<{ success: boolean; error?: string }>;
  label: string;
  /** Wenn gesetzt, braucht es einen zweiten Tipp mit diesem Text. */
  confirmLabel?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const style = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    danger: "btn-danger",
  }[confirming ? "danger" : variant];

  function run() {
    if (confirmLabel && !confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await action();
      setConfirming(false);
      if (!result.success) setError(result.error ?? "Aktion fehlgeschlagen");
      else router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" disabled={isPending} onClick={run} className={`btn btn-sm ${style}`}>
        {confirming ? confirmLabel : label}
      </button>
      {error && (
        <span className="text-[13px] text-danger" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
