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
        className="btn btn-primary w-full"
      >
        {isPending ? "Wird beantragt..." : "Diesem Gelände beitreten"}
      </button>
      {error && (
        <p className="text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
