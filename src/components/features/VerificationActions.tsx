"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approvePlate, rejectPlate } from "@/app/admin/actions";

/**
 * Genehmigen/Ablehnen einer einzelnen Verifizierung. Die Liste selbst rendert
 * der Server; nur diese Schaltflächen brauchen Interaktivität.
 */
export default function VerificationActions({ plateId }: { plateId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: (id: string) => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action(plateId);
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
          onClick={() => run(approvePlate)}
          disabled={isPending}
          className="btn btn-sm btn-primary flex-1"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Genehmigen
        </button>
        <button
          type="button"
          onClick={() => run(rejectPlate)}
          disabled={isPending}
          className="btn btn-sm btn-danger flex-1"
        >
          Ablehnen
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
