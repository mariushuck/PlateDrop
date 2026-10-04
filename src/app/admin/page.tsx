import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import VerificationActions from "@/components/features/VerificationActions";
import { requireAdmin } from "@/lib/auth/session";
import { listPendingVerifications } from "@/lib/db/queries";
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
  const pendingVerifications = await listPendingVerifications(admin.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Admin Dashboard</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Überprüfen und genehmigen Sie ausstehende Kennzeichen-Verifizierungen
        </p>
      </div>

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
                  src={`/api/proofs/${verification.proof_image_url}`}
                  alt={`Beweisfoto für ${verification.plate_number}`}
                  width={800}
                  height={800}
                  className="w-full h-auto object-cover"
                  priority={false}
                  // Beweisfotos zeigen echte Kennzeichen – nicht durch den
                  // Bild-Cache von Next.js auf die Platte spiegeln.
                  unoptimized
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
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Code:</p>
                  <p className="font-mono text-lg font-bold text-slate-900 dark:text-white">
                    {verification.verification_code}
                  </p>
                </div>

                {isCanonicalPlate(verification.plate_number) ? (
                  <VerificationActions plateId={verification.id} />
                ) : (
                  // Altzeile aus der Zeit vor Migration 0008: mehrdeutig, Freigabe
                  // und Ablehnung scheitern an der Formatprüfung.
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-xs text-amber-900 dark:text-amber-100">
                      Altformat: Kennzeichen anhand des Fotos zuordnen (docs/admin.md, A3), danach
                      hier freigeben.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
