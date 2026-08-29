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
          className="flex-1 rounded-lg border border-green-600 bg-green-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:border-green-700 hover:bg-green-700 disabled:opacity-50 dark:border-green-500 dark:bg-green-500 dark:hover:border-green-600 dark:hover:bg-green-600"
        >
          {isPending ? <Loader2 className="inline-block h-4 w-4 animate-spin" /> : "Genehmigen"}
        </button>
        <button
          type="button"
          onClick={() => run(rejectPlate)}
          disabled={isPending}
          className="flex-1 rounded-lg border border-red-600 bg-red-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:border-red-700 hover:bg-red-700 disabled:opacity-50 dark:border-red-500 dark:bg-red-500 dark:hover:border-red-600 dark:hover:bg-red-600"
        >
          {isPending ? <Loader2 className="inline-block h-4 w-4 animate-spin" /> : "Ablehnen"}
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
