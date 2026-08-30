import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Impressum | PlateDrop",
  description: "Impressum und Kontaktinformationen von PlateDrop",
};

/**
 * TODO(go-live): Alle mit „Platzhalter“ markierten Werte durch die echten
 * Angaben des Betreibers ersetzen und anschließend juristisch prüfen lassen.
 * Ohne diese Angaben ist die Seite nicht rechtskonform (§ 5 DDG).
 */
const PLACEHOLDER = "[Platzhalter – vor Go-Live ersetzen]";

export default function Impressum() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col items-center gap-1 px-4 py-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Impressum</h1>
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Angaben gemäß § 5 DDG
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-8 text-slate-700 dark:text-slate-300">
          <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Hinweis: Dieses Impressum enthält noch Platzhalter. Vor dem produktiven Betrieb müssen
            die tatsächlichen Angaben des Betreibers eingetragen werden.
          </p>

          {/* Diensteanbieter */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              Diensteanbieter
            </h2>
            <p className="mb-2">
              <strong>{PLACEHOLDER}</strong> (Name bzw. Firma des Betreibers)
            </p>
            <p className="mb-2">
              <strong>Rechtsform:</strong> {PLACEHOLDER}
            </p>
            <p>
              {PLACEHOLDER}
              <br />
              (Straße und Hausnummer)
              <br />
              {PLACEHOLDER} (PLZ, Ort)
              <br />
              Deutschland
            </p>
          </section>

          {/* Kontakt */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">Kontakt</h2>
            <p>
              <strong>E-Mail:</strong> {PLACEHOLDER}
              <br />
              <strong>Telefon:</strong> {PLACEHOLDER}
            </p>
          </section>

          {/* Vertretungsberechtigte */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              Vertretungsberechtigte Person(en)
            </h2>
            <p>{PLACEHOLDER} (z. B. Geschäftsführung / Inhaber:in)</p>
          </section>

          {/* Registereintrag */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              Registereintrag
            </h2>
            <p className="mb-2">
              <strong>Registergericht:</strong> {PLACEHOLDER}
            </p>
            <p>
              <strong>Registernummer:</strong> {PLACEHOLDER} (z. B. HRB …)
            </p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Entfällt, sofern der Betreiber nicht im Handels-, Vereins-, Partnerschafts- oder
              Genossenschaftsregister eingetragen ist.
            </p>
          </section>

          {/* Umsatzsteuer-ID */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              Umsatzsteuer-ID
            </h2>
            <p>
              <strong>USt-IdNr. gemäß § 27a UStG:</strong> {PLACEHOLDER}
            </p>
          </section>

          {/* Redaktionell Verantwortlicher */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              Verantwortlich i.S.d. § 18 Abs. 2 MStV
            </h2>
            <p>
              {PLACEHOLDER} (Name)
              <br />
              {PLACEHOLDER} (Anschrift, falls abweichend von oben)
            </p>
          </section>

          {/* Disclaimer */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              Haftungsausschluss
            </h2>
            <p className="mb-2">
              Trotz sorgfältiger inhaltlicher Kontrolle übernehmen wir keine Haftung für die Inhalte
              externer Links. Für den Inhalt der verlinkten Seiten sind ausschließlich deren
              Betreiber verantwortlich.
            </p>
            <p>
              Die auf dieser Website angebotenen Dienste und Funktionen werden ohne Gewähr
              bereitgestellt. Wir haften nicht für unmittelbare oder mittelbare Schäden, die durch
              die Nutzung entstehen.
            </p>
          </section>

          {/* Intellectual Property */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              Urheberrecht
            </h2>
            <p>
              Alle Inhalte dieser Website, einschließlich Text, Bilder und Design, sind
              urheberrechtlich geschützt. Eine Vervielfältigung oder Weiterverbreitung bedarf der
              ausdrücklichen Genehmigung des Betreibers.
            </p>
          </section>

          {/* Data Protection */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              Datenschutz
            </h2>
            <p>
              Informationen zur Verarbeitung personenbezogener Daten finden Sie in unserer{" "}
              <a href="/datenschutz" className="text-blue-600 hover:underline dark:text-blue-400">
                Datenschutzerklärung
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
