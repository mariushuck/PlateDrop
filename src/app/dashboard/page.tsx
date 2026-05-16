"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { claimPlate, uploadProof } from "./actions";
import { Inbox, AlertCircle, CheckCircle2, Camera } from "lucide-react";
import ClaimPlateForm from "@/components/features/ClaimPlateForm";
import { Database } from "@/types/database.types";

type VerifiedPlate = Database["public"]["Tables"]["verified_plates"]["Row"];

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [allPlates, setAllPlates] = useState<VerifiedPlate[]>([]);
  const [messages, setMessages] = useState<
    Array<{
      id: string;
      plate_number: string;
      message_text: string;
      created_at: string;
    }>
  >([]);
  const [uploadingPlateId, setUploadingPlateId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      // Get authenticated user
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData.user) {
        window.location.href = "/login";
        return;
      }

      setUserId(userData.user.id);

      // Fetch all plates for this user
      const { data: platesData, error: platesError } = await supabase
        .from("verified_plates")
        .select("*")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false });

      if (platesError) {
        console.error("Error fetching plates:", platesError);
      }

      const plates = platesData || [];
      setAllPlates(plates);

      // Fetch messages for approved plates
      const approvedPlateNumbers = plates
        .filter((p) => p.is_verified)
        .map((p) => p.plate_number);

      if (approvedPlateNumbers.length > 0) {
        const { data: messagesData, error: messagesError } = await supabase
          .from("messages")
          .select("id, plate_number, message_text, created_at")
          .in("plate_number", approvedPlateNumbers)
          .order("created_at", { ascending: false });

        if (messagesError) {
          console.error("Error fetching messages:", messagesError);
        } else {
          setMessages(messagesData || []);
        }
      }

      setIsLoading(false);
    }

    loadData();
  }, [supabase]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-center rounded-lg bg-slate-50 py-12 dark:bg-slate-700">
          <p className="text-slate-600 dark:text-slate-400">Wird geladen...</p>
        </div>
      </div>
    );
  }

  const messagesByPlate: Record<string, typeof messages> = {};
  messages.forEach((msg) => {
    if (!messagesByPlate[msg.plate_number]) {
      messagesByPlate[msg.plate_number] = [];
    }
    messagesByPlate[msg.plate_number].push(msg);
  });

  const verifiedPlates = allPlates.filter((p) => p.is_verified);
  const pendingPlates = allPlates.filter(
    (p) => !p.is_verified && p.verification_status === "pending",
  );
  const totalApprovedMessages = messages.length;

  const hasNoContent = allPlates.length === 0 && messages.length === 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Section A: Claim Plate */}
      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">
          Kennzeichen registrieren
        </h2>
        <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
          Registrieren Sie ein deutsches Kennzeichen, um Nachrichten dafür zu
          lesen.
        </p>
        <ClaimPlateForm action={claimPlate} />
      </section>

      {/* Section B: Pending Plates with Photo Challenge */}
      {pendingPlates.length > 0 && (
        <section className="mb-8 rounded-lg border-2 border-amber-300 bg-amber-50 p-6 shadow-sm dark:border-amber-700 dark:bg-amber-900/20">
          <h2 className="mb-4 text-lg font-bold text-amber-900 dark:text-amber-100">
            Verifizierung erforderlich
          </h2>

          <div className="space-y-6">
            {pendingPlates.map((plate) => (
              <div
                key={plate.id}
                className="rounded-lg border border-amber-200 bg-white p-4 dark:border-amber-800 dark:bg-slate-800"
              >
                {/* Plate Display */}
                <div className="mb-4 inline-block rounded-lg border-2 border-slate-900 bg-yellow-300 px-3 py-2 font-mono font-bold text-slate-900 dark:border-white dark:bg-yellow-200">
                  {plate.plate_number}
                </div>

                {/* Instructions */}
                <div className="mb-6 rounded-lg bg-amber-100 p-4 dark:bg-amber-900/30">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                    Bestätigungscode:
                  </p>
                  <p className="mt-2 font-mono text-2xl font-bold text-amber-900 dark:text-amber-100">
                    {plate.verification_code}
                  </p>
                  <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">
                    Bitte schreibe diesen Code groß auf einen Zettel, lege ihn
                    gut sichtbar hinter die Windschutzscheibe und mache ein
                    Foto, auf dem dein Kennzeichen lesbar ist.
                  </p>
                </div>

                {/* Photo Upload */}
                {plate.proof_image_url ? (
                  <div className="flex items-center gap-2 rounded-lg bg-green-100 p-4 dark:bg-green-900/30">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <p className="text-sm font-medium text-green-800 dark:text-green-200">
                      Wird vom Admin geprüft
                    </p>
                  </div>
                ) : (
                  <ProofUploadForm plateId={plate.id} />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section C: Messages Inbox */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-2">
          <Inbox className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Nachrichten ({totalApprovedMessages})
          </h2>
        </div>

        {hasNoContent ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-slate-50 py-12 dark:bg-slate-700">
            <AlertCircle className="h-8 w-8 text-slate-400 dark:text-slate-500" />
            <p className="text-center text-sm text-slate-600 dark:text-slate-400">
              Keine Kennzeichen registriert.
              <br />
              Registrieren Sie ein Kennzeichen oben, um Nachrichten zu sehen.
            </p>
          </div>
        ) : verifiedPlates.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-slate-50 py-12 dark:bg-slate-700">
            <AlertCircle className="h-8 w-8 text-slate-400 dark:text-slate-500" />
            <p className="text-center text-sm text-slate-600 dark:text-slate-400">
              Kein verifiziertes Kennzeichen.
              <br />
              Schließen Sie die Verifizierung ab, um Nachrichten zu lesen.
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-slate-50 py-12 dark:bg-slate-700">
            <Inbox className="h-8 w-8 text-slate-400 dark:text-slate-500" />
            <p className="text-center text-sm text-slate-600 dark:text-slate-400">
              Noch keine Nachrichten für Ihre Kennzeichen.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {verifiedPlates.map((plate) => {
              const plateMessages = messagesByPlate[plate.plate_number] || [];

              return (
                <div
                  key={plate.plate_number}
                  className="border-t border-slate-200 pt-6 first:border-t-0 first:pt-0 dark:border-slate-700"
                >
                  {/* Plate Header */}
                  <div className="mb-4 inline-block rounded-lg border-2 border-slate-900 bg-yellow-300 px-3 py-2 font-mono font-bold text-slate-900 dark:border-white dark:bg-yellow-200">
                    {plate.plate_number}
                  </div>

                  {plateMessages.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Keine Nachrichten für dieses Kennzeichen.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {plateMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-700"
                        >
                          <p className="text-sm text-slate-900 dark:text-white">
                            {msg.message_text}
                          </p>
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {new Date(msg.created_at).toLocaleDateString(
                              "de-DE",
                              {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function ProofUploadForm({ plateId }: { plateId: string }) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append("proof", file);

      const result = await uploadProof(plateId, formData);

      if (!result.success) {
        setError(result.error || "Fehler beim Hochladen");
        setIsUploading(false);
        return;
      }

      setSuccess(true);
      setIsUploading(false);

      // Reload page after successful upload
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      setError("Ein Fehler ist aufgetreten");
      setIsUploading(false);
    }
  }

  if (success) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-green-100 p-4 dark:bg-green-900/30">
        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
        <p className="text-sm font-medium text-green-800 dark:text-green-200">
          Bild erfolgreich hochgeladen!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 p-4 transition-colors hover:border-amber-400 dark:border-amber-700 dark:bg-amber-900/10 dark:hover:border-amber-600">
        <Camera className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Foto hochladen
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-200">
            {isUploading
              ? "Wird hochgeladen..."
              : "Klicke hier, um ein Bild zu wählen"}
          </p>
        </div>
        <input
          type="file"
          accept="image/*"
          onChange={handleUpload}
          disabled={isUploading}
          className="hidden"
        />
      </label>

      {error && (
        <div className="rounded-lg bg-red-100 p-3 dark:bg-red-900/30">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}
    </div>
  );
}
