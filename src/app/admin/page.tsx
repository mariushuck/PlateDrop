import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import ReportActions from "@/components/features/ReportActions";
import VerificationActions from "@/components/features/VerificationActions";
import { requireAdmin } from "@/lib/auth/session";
import { listOpenReports, listPendingVerifications } from "@/lib/db/queries";
import { messageType } from "@/lib/messages/catalog";
import { isCanonicalPlate } from "@/lib/utils/plateUtils";

/**
 * Server Component. Zuvor lief die Seite im Browser und verließ sich darauf,
 * dass RLS ihr nur als Admin Daten liefert; die Beweisfotos kamen über
 * kurzlebige Signed URLs. Jetzt prüft die Seite selbst (requireAdmin), lädt
 * serverseitig, und die Bilder laufen über /api/proofs — dort wird bei JEDEM
 * Abruf erneut geprüft, statt vorab für zehn Minuten freizugeben.
 */
export default async function AdminPage() {
  const admin = await requireAdmin();
  const [pendingVerifications, openReports] = await Promise.all([
    listPendingVerifications(admin.id),
    listOpenReports(admin.id),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-9 px-4 pt-6 pb-8">
      <div>
        <h1 className="large-title">Prüfungen</h1>
        <p className="mt-1 text-[17px] text-secondary">
          Kennzeichen-Verifizierungen und gemeldete Nachrichten
        </p>
      </div>

      {openReports.length > 0 && (
        <section>
          <h2 className="section-header">Meldungen ({openReports.length})</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {openReports.map((report) => (
              <div key={report.id} className="inset-group space-y-3 p-4">
                <div>
                  <p className="text-[15px] font-semibold text-danger">{report.reason}</p>
                  <p className="text-[13px] text-secondary">
                    gemeldet am {new Date(report.created_at).toLocaleDateString("de-DE")} · an{" "}
                    {report.plate_number}, gesendet am{" "}
                    {new Date(report.message_created_at).toLocaleDateString("de-DE")}
                  </p>
                </div>
                <p className="whitespace-pre-wrap rounded-[10px] bg-fill p-3 text-[15px]">
                  {(report.message_type && messageType(report.message_type)?.text) ??
                    report.message_text}
                </p>
                <ReportActions reportId={report.id} messageId={report.message_id} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-header">Verifizierungen ({pendingVerifications.length})</h2>
        {pendingVerifications.length === 0 ? (
          <div className="inset-group flex flex-col items-center gap-2 px-6 py-10 text-center">
            <CheckCircle2 className="h-9 w-9 text-success" aria-hidden="true" />
            <p className="text-[17px] font-semibold">Keine ausstehenden Verifizierungen</p>
            <p className="text-[15px] text-secondary">Alle Kennzeichen wurden überprüft.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pendingVerifications.map((verification) => (
              <div key={verification.id} className="inset-group">
                <Image
                  src={`/api/proofs/${verification.proof_image_url}`}
                  alt={`Beweisfoto für ${verification.plate_number}`}
                  width={800}
                  height={800}
                  className="h-auto w-full object-cover"
                  priority={false}
                  // Beweisfotos zeigen echte Kennzeichen – nicht durch den
                  // Bild-Cache von Next.js auf die Platte spiegeln.
                  unoptimized
                />

                <div className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="plate">{verification.plate_number}</span>
                    <span className="font-mono text-[17px] font-bold">
                      <span className="sr-only">Code: </span>
                      {verification.verification_code}
                    </span>
                  </div>

                  {verification.has_approved_holder && (
                    <p className="flex items-start gap-2 text-[13px] text-warning">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      Für dieses Kennzeichen gibt es bereits einen freigegebenen Halter. Eine
                      Freigabe löst ihn ab; er wird per Mail informiert.
                    </p>
                  )}

                  {isCanonicalPlate(verification.plate_number) ? (
                    <VerificationActions plateId={verification.id} />
                  ) : (
                    // Altzeile aus der Zeit vor Migration 0008: mehrdeutig, Freigabe
                    // und Ablehnung scheitern an der Formatprüfung.
                    <p className="flex items-start gap-2 text-[13px] text-warning">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      Altformat: Kennzeichen anhand des Fotos zuordnen (docs/admin.md, A3), danach
                      hier freigeben.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
