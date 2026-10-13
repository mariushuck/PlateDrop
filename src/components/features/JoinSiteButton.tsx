"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { joinSite } from "@/app/s/[token]/actions";

export default function JoinSiteButton({ token }: { token: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await joinSite(token);
            if (!result.success) setError(result.error ?? "Beitritt fehlgeschlagen");
            else router.refresh();
          })
        }
        className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:bg-slate-400 dark:bg-white dark:text-slate-900"
      >
        {isPending ? "Wird beantragt..." : "Diesem Gelände beitreten"}
      </button>
      {error && (
        <p className="text-red-800 dark:text-red-200" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
