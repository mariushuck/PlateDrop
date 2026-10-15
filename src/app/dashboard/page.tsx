import { AlertCircle, CheckCircle2, Inbox, XCircle } from "lucide-react";
import ClaimPlateForm from "@/components/features/ClaimPlateForm";
import MarkMessagesRead from "@/components/features/MarkMessagesRead";
import MessageActions from "@/components/features/MessageActions";
import PlatePauseControl from "@/components/features/PlatePauseControl";
import ProofUploadForm from "@/components/features/ProofUploadForm";
import RemovePlateButton from "@/components/features/RemovePlateButton";
import SitesSection from "@/components/features/SitesSection";
import { MessageTypeIcon } from "@/components/ui/MessageTypeIcon";
import { requireUser } from "@/lib/auth/session";
import {
  listMessagesForUser,
  listMyAdminOrgs,
  listMyMemberships,
  listPlatesForUser,
} from "@/lib/db/queries";
import type { Message } from "@/lib/db/types";
import { messageType } from "@/lib/messages/catalog";
import { isCanonicalPlate } from "@/lib/utils/plateUtils";
import { claimPlate } from "./actions";

/**
 * Server Component. Unter Supabase lief diese Seite als Client Component und
 * hat per PostgREST selbst abgefragt – ohne PostgREST gibt es keinen
 * Datenbankzugang aus dem Browser mehr. Die Daten kommen jetzt beim Rendern
 * aus dem Data-Access-Modul, interaktiv bleiben nur die beiden Formulare.
 */
export default async function DashboardPage() {
  const user = await requireUser();

  const [allPlates, messages, memberships, adminOrgs] = await Promise.all([
    listPlatesForUser(user.id),
    listMessagesForUser(user.id),
    listMyMemberships(user.id),
    listMyAdminOrgs(user.id),
  ]);

  // Je Kennzeichen-Zeile: dieselbe Nummer kann öffentlich und in einer
  // Organisation registriert sein, mit getrennten Nachrichten.
  const messagesByPlate: Record<string, Message[]> = {};
  for (const msg of messages) {
    const key = msg.plate_id ?? msg.plate_number;
    const bucket = messagesByPlate[key] ?? [];
    bucket.push(msg);
    messagesByPlate[key] = bucket;
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
  // Verfallen (ohne Foto nach 7 Tagen) oder durch einen neuen Halter abgelöst.
  const endedPlates = allPlates.filter(
    (p) => p.verification_status === "expired" || p.verification_status === "superseded",
  );
  const totalApprovedMessages = messages.length;

  const hasNoContent = allPlates.length === 0 && messages.length === 0;

  return (
    <div className="mx-auto max-w-xl space-y-9 px-4 pt-6 pb-8">
      <h1 className="large-title">Übersicht</h1>

      {openPlates.length > 0 && (
        <section>
          <h2 className="section-header">Verifizierung erforderlich</h2>
          <div className="space-y-4">
            {openPlates.map((plate) => (
              <div key={plate.id} className="inset-group space-y-4 p-4">
                <span className="plate text-lg">{plate.plate_number}</span>
                {plate.org_name && (
                  <p className="text-[15px] text-secondary">
                    {plate.org_name}: wartet auf Freigabe durch die Verwaltung. Ein Foto ist nicht
                    nötig.
                  </p>
                )}

                {plate.verification_status === "rejected" && (
                  <div className="flex items-start gap-3 text-[15px]" role="alert">
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
                    <div>
                      <p className="font-semibold text-danger">Die Prüfung war nicht erfolgreich</p>
                      <p className="mt-1">
                        Bitte lade ein neues Foto hoch, auf dem sowohl der Bestätigungscode als auch
                        das Kennzeichen gut lesbar sind.
                      </p>
                    </div>
                  </div>
                )}

                {!plate.org_id && (
                  <div className="rounded-[10px] bg-fill p-4">
                    <p className="text-[13px] text-secondary">Bestätigungscode</p>
                    <p className="mt-1 font-mono text-[28px] font-bold tracking-wider">
                      {plate.verification_code}
                    </p>
                    <p className="mt-3 text-[15px]">
                      Bitte schreibe diesen Code groß auf einen Zettel, lege ihn gut sichtbar hinter
                      die Windschutzscheibe und mache ein Foto, auf dem dein Kennzeichen lesbar ist.
                    </p>
                  </div>
                )}

                {/* Photo Upload — bei einer Ablehnung liegt der alte Pfad noch in der
                    Zeile, trotzdem muss hier wieder das Upload-Feld stehen. Altzeilen
                    ohne Trennstriche (vor Migration 0008) ordnet der Admin zu; ein
                    neues Foto würde dort an der Formatprüfung scheitern. */}
                {plate.org_id ? null : !isCanonicalPlate(plate.plate_number) ? (
                  <p className="flex items-start gap-3 text-[15px] text-secondary">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    Dieses Kennzeichen wurde vor einer Formatumstellung gespeichert und wird vom
                    Admin anhand deines Fotos neu zugeordnet. Du musst nichts tun.
                  </p>
                ) : plate.proof_image_url && plate.verification_status === "pending" ? (
                  <p className="flex items-center gap-2 text-[15px] font-medium text-success">
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    Wird vom Admin geprüft
                  </p>
                ) : (
                  <ProofUploadForm plateId={plate.id} />
                )}
                <RemovePlateButton plateId={plate.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      <MarkMessagesRead messageIds={messages.filter((m) => !m.read_at).map((m) => m.id)} />

      <section>
        <h2 className="section-header">Nachrichten ({totalApprovedMessages})</h2>

        {hasNoContent || verifiedPlates.length === 0 ? (
          <div className="inset-group flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Inbox className="h-9 w-9 text-secondary" aria-hidden="true" />
            <p className="text-[17px] font-semibold">
              {hasNoContent ? "Keine Kennzeichen registriert" : "Kein verifiziertes Kennzeichen"}
            </p>
            <p className="text-[15px] text-secondary">
              {hasNoContent
                ? "Registriere unten ein Kennzeichen, um Nachrichten zu sehen."
                : "Schließe die Verifizierung ab, um Nachrichten zu lesen."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {verifiedPlates.map((plate) => {
              const plateMessages = messagesByPlate[plate.id] || [];

              return (
                <div key={plate.id}>
                  <div className="mb-2 flex items-center gap-3 px-1">
                    <span className="plate">{plate.plate_number}</span>
                    {plate.org_name && (
                      <span className="truncate text-[15px] text-secondary">{plate.org_name}</span>
                    )}
                  </div>
                  <div className="inset-group">
                    {plateMessages.length === 0 ? (
                      <p className="list-row text-[15px] text-secondary">
                        Keine Nachrichten für dieses Kennzeichen.
                      </p>
                    ) : (
                      plateMessages.map((msg) => {
                        const type = msg.message_type ? messageType(msg.message_type) : undefined;
                        return (
                          <article key={msg.id} className="list-row items-start">
                            <span
                              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-white ${
                                type?.urgent ? "bg-warning" : "bg-tint"
                              }`}
                            >
                              <MessageTypeIcon icon={type?.icon} className="h-[18px] w-[18px]" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start gap-2">
                                <p
                                  className={`flex-1 text-[17px] leading-snug ${msg.read_at ? "" : "font-semibold"}`}
                                >
                                  {type?.text ?? msg.message_text}
                                </p>
                                {!msg.read_at && (
                                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-tint">
                                    <span className="sr-only">neu</span>
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-[13px] text-secondary">
                                {new Date(msg.created_at).toLocaleDateString("de-DE", {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                                {msg.site_name && ` · ${msg.site_name}`}
                                {msg.sender_name && ` · von ${msg.sender_name}`}
                              </p>
                              <MessageActions messageId={msg.id} />
                            </div>
                          </article>
                        );
                      })
                    )}
                    <div className="list-row">
                      <PlatePauseControl
                        plateId={plate.id}
                        pausedUntil={
                          plate.paused_until && new Date(plate.paused_until) > new Date()
                            ? new Date(plate.paused_until).toISOString()
                            : null
                        }
                      />
                    </div>
                    <div className="list-row">
                      <RemovePlateButton plateId={plate.id} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="section-footer">
          Angezeigt werden Nachrichten ab 30 Tage vor der Registrierung des jeweiligen Kennzeichens.
          Ältere Nachrichten können an eine frühere Halterin oder einen früheren Halter gerichtet
          sein.
        </p>
      </section>

      <section>
        <h2 className="section-header">Kennzeichen registrieren</h2>
        <div className="inset-group p-4">
          <ClaimPlateForm action={claimPlate} />
        </div>
        <p className="section-footer">
          Registriere ein deutsches Kennzeichen, um Nachrichten dafür zu lesen.
        </p>
      </section>

      <SitesSection memberships={memberships} adminOrgs={adminOrgs} />

      {endedPlates.length > 0 && (
        <section>
          <h2 className="section-header">Beendet</h2>
          <div className="inset-group">
            {endedPlates.map((plate) => (
              <div key={plate.id} className="list-row flex-col items-start gap-2">
                <span className="plate opacity-50">{plate.plate_number}</span>
                <p className="text-[15px] text-secondary">
                  {plate.org_name
                    ? `${plate.org_name}: beendet, weil du an keinem Standort mehr Mitglied bist oder eine andere Person bestätigt wurde.`
                    : plate.verification_status === "superseded"
                      ? "Eine andere Person wurde für dieses Kennzeichen bestätigt. Fährst du das Fahrzeug weiterhin, beanspruche es oben erneut."
                      : "Ohne Foto nach 7 Tagen verfallen. Du kannst es oben erneut beanspruchen."}
                </p>
                <RemovePlateButton plateId={plate.id} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
