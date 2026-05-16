"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { approvePlate, rejectPlate } from "./actions";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Database } from "@/types/database.types";

type VerifiedPlate = Database["public"]["Tables"]["verified_plates"]["Row"];

interface PendingVerification extends VerifiedPlate {
  proof_image_url: string;
}

export default function AdminPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [pendingVerifications, setPendingVerifications] = useState<
    PendingVerification[]
  >([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function loadPendingVerifications() {
      try {
        // Fetch pending verifications with proof images
        const { data, error } = await supabase
          .from("verified_plates")
          .select("*")
          .eq("verification_status", "pending")
          .not("proof_image_url", "is", null)
          .order("created_at", { ascending: true });

        if (error) {
          console.error("Error fetching pending verifications:", error);
          setIsLoading(false);
          return;
        }

        setPendingVerifications((data || []) as PendingVerification[]);
        setIsLoading(false);
      } catch (err) {
        console.error("Unexpected error:", err);
        setIsLoading(false);
      }
    }

    loadPendingVerifications();
  }, [supabase]);

  async function handleApprove(plateId: string) {
    setProcessingId(plateId);
    setActionError(null);

    const result = await approvePlate(plateId);

    if (!result.success) {
      setActionError(result.error || "Fehler beim Genehmigen");
      setProcessingId(null);
      return;
    }

    // Remove from list and refresh
    setPendingVerifications((prev) => prev.filter((p) => p.id !== plateId));
    setProcessingId(null);
  }

  async function handleReject(plateId: string) {
    setProcessingId(plateId);
    setActionError(null);

    const result = await rejectPlate(plateId);

    if (!result.success) {
      setActionError(result.error || "Fehler beim Ablehnen");
      setProcessingId(null);
      return;
    }

    // Remove from list and refresh
    setPendingVerifications((prev) => prev.filter((p) => p.id !== plateId));
    setProcessingId(null);
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-center justify-center rounded-lg bg-slate-50 py-12 dark:bg-slate-700">
          <p className="text-slate-600 dark:text-slate-400">Wird geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Admin Dashboard
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Überprüfen und genehmigen Sie ausstehende Kennzeichen-Verifizierungen
        </p>
      </div>

      {/* Error Alert */}
      {actionError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-800 dark:text-red-200">
              {actionError}
            </p>
          </div>
        </div>
      )}

      {/* Pending Verifications Grid */}
      {pendingVerifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-slate-200 bg-slate-50 py-12 dark:border-slate-700 dark:bg-slate-800">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Keine ausstehenden Verifizierungen
            <br />
            Alle Kennzeichen wurden überprüft.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {pendingVerifications.map((verification) => (
            <div
              key={verification.id}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              {/* Image Container: provide explicit width/height/alt to avoid layout shift */}
              <div className="w-full overflow-hidden rounded-t-xl">
                <Image
                  src={verification.proof_image_url}
                  alt={`Beweisfoto für ${verification.plate_number}`}
                  width={800}
                  height={800}
                  className="w-full h-auto object-cover"
                  priority={false}
                />
              </div>

              {/* Content */}
              <div className="p-4">
                {/* Plate Number */}
                <div className="mb-3 inline-block rounded-lg border-2 border-slate-900 bg-yellow-300 px-2 py-1 font-mono text-sm font-bold text-slate-900 dark:border-white dark:bg-yellow-200">
                  {verification.plate_number}
                </div>

                {/* Verification Code */}
                <div className="mb-4">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Code:
                  </p>
                  <p className="font-mono text-lg font-bold text-slate-900 dark:text-white">
                    {verification.verification_code}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(verification.id)}
                    disabled={processingId === verification.id}
                    className="flex-1 rounded-lg border border-green-600 bg-green-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:border-green-700 hover:bg-green-700 disabled:opacity-50 dark:border-green-500 dark:bg-green-500 dark:hover:border-green-600 dark:hover:bg-green-600"
                  >
                    {processingId === verification.id ? (
                      <Loader2 className="inline-block h-4 w-4 animate-spin" />
                    ) : (
                      "Genehmigen"
                    )}
                  </button>
                  <button
                    onClick={() => handleReject(verification.id)}
                    disabled={processingId === verification.id}
                    className="flex-1 rounded-lg border border-red-600 bg-red-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:border-red-700 hover:bg-red-700 disabled:opacity-50 dark:border-red-500 dark:bg-red-500 dark:hover:border-red-600 dark:hover:bg-red-600"
                  >
                    {processingId === verification.id ? (
                      <Loader2 className="inline-block h-4 w-4 animate-spin" />
                    ) : (
                      "Ablehnen"
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
