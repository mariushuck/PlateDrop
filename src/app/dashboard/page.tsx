import { AlertCircle, CheckCircle2, Inbox, XCircle } from "lucide-react";
import ClaimPlateForm from "@/components/features/ClaimPlateForm";
import ProofUploadForm from "@/components/features/ProofUploadForm";
import { requireUser } from "@/lib/auth/session";
import { listMessagesForUser, listPlatesForUser } from "@/lib/db/queries";
import type { Message } from "@/lib/db/types";
import { claimPlate } from "./actions";

/**
 * Server Component. Unter Supabase lief diese Seite als Client Component und
 * hat per PostgREST selbst abgefragt – ohne PostgREST gibt es keinen
 * Datenbankzugang aus dem Browser mehr. Die Daten kommen jetzt beim Rendern
 * aus dem Data-Access-Modul, interaktiv bleiben nur die beiden Formulare.
 */
export default async function DashboardPage() {
  const user = await requireUser();

  const [allPlates, messages] = await Promise.all([
    listPlatesForUser(user.id),
    listMessagesForUser(user.id),
  ]);

  const messagesByPlate: Record<string, Message[]> = {};
  for (const msg of messages) {
    const bucket = messagesByPlate[msg.plate_number] ?? [];
    bucket.push(msg);
    messagesByPlate[msg.plate_number] = bucket;
  }

  const verifiedPlates = allPlates.filter((p) => p.is_verified);
  // Abgelehnte Kennzeichen gehören mit in diese Liste. Sonst verschwinden sie
  // spurlos: Sie tauchen beim Admin nicht mehr auf, belegen die Nummer aber
  // weiterhin, und der Halter hätte keinen Weg, ein neues Foto nachzureichen.
  const openPlates = allPlates.filter(
    (p) =>
      !p.is_verified &&
      (p.verification_status === "pending" || p.verification_status === "rejected"),
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
          Registrieren Sie ein deutsches Kennzeichen, um Nachrichten dafür zu lesen.
        </p>
        <ClaimPlateForm action={claimPlate} />
      </section>

      {/* Section B: Pending Plates with Photo Challenge */}
      {openPlates.length > 0 && (
        <section className="mb-8 rounded-lg border-2 border-amber-300 bg-amber-50 p-6 shadow-sm dark:border-amber-700 dark:bg-amber-900/20">
          <h2 className="mb-4 text-lg font-bold text-amber-900 dark:text-amber-100">
            Verifizierung erforderlich
          </h2>

          <div className="space-y-6">
            {openPlates.map((plate) => (
              <div
                key={plate.id}
                className="rounded-lg border border-amber-200 bg-white p-4 dark:border-amber-800 dark:bg-slate-800"
              >
                {/* Plate Display */}
                <div className="mb-4 inline-block rounded-lg border-2 border-slate-900 bg-yellow-300 px-3 py-2 font-mono font-bold text-slate-900 dark:border-white dark:bg-yellow-200">
                  {plate.plate_number}
                </div>

                {plate.verification_status === "rejected" && (
                  <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                    <div>
                      <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                        Die Prüfung war nicht erfolgreich
                      </p>
                      <p className="mt-1 text-sm text-red-800 dark:text-red-200">
                        Bitte lade ein neues Foto hoch, auf dem sowohl der Bestätigungscode als auch
                        das Kennzeichen gut lesbar sind.
                      </p>
                    </div>
                  </div>
                )}

                {/* Instructions */}
                <div className="mb-6 rounded-lg bg-amber-100 p-4 dark:bg-amber-900/30">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                    Bestätigungscode:
                  </p>
                  <p className="mt-2 font-mono text-2xl font-bold text-amber-900 dark:text-amber-100">
                    {plate.verification_code}
                  </p>
                  <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">
                    Bitte schreibe diesen Code groß auf einen Zettel, lege ihn gut sichtbar hinter
                    die Windschutzscheibe und mache ein Foto, auf dem dein Kennzeichen lesbar ist.
                  </p>
                </div>

                {/* Photo Upload — bei einer Ablehnung liegt der alte Pfad noch in der
                    Zeile, trotzdem muss hier wieder das Upload-Feld stehen. */}
                {plate.proof_image_url && plate.verification_status === "pending" ? (
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
                            {new Date(msg.created_at).toLocaleDateString("de-DE", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
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
