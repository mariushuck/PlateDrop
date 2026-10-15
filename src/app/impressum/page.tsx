import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/ui/NavBar";

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
    <div className="flex flex-1 flex-col">
      <NavBar width="max-w-2xl">
        <Link href="/" className="text-[17px] font-semibold active:opacity-60">
          PlateDrop
        </Link>
      </NavBar>

      <main className="flex-1 px-4 pt-6 pb-8">
        <div className="mx-auto max-w-2xl space-y-8 text-[17px] leading-relaxed">
          <header>
            <h1 className="large-title">Impressum</h1>
            <p className="mt-1 text-secondary">Angaben gemäß § 5 DDG</p>
          </header>
          <p className="rounded-xl bg-surface p-4 text-[15px] text-warning">
            Hinweis: Dieses Impressum enthält noch Platzhalter. Vor dem produktiven Betrieb müssen
            die tatsächlichen Angaben des Betreibers eingetragen werden.
          </p>

          {/* Diensteanbieter */}
          <section>
            <h2 className="mb-2 text-[22px] font-bold leading-tight">Diensteanbieter</h2>
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
            <h2 className="mb-2 text-[22px] font-bold leading-tight">Kontakt</h2>
            <p>
              <strong>E-Mail:</strong> {PLACEHOLDER}
              <br />
              <strong>Telefon:</strong> {PLACEHOLDER}
            </p>
          </section>

          {/* Vertretungsberechtigte */}
          <section>
            <h2 className="mb-2 text-[22px] font-bold leading-tight">
              Vertretungsberechtigte Person(en)
            </h2>
            <p>{PLACEHOLDER} (z. B. Geschäftsführung / Inhaber:in)</p>
          </section>

          {/* Registereintrag */}
          <section>
            <h2 className="mb-2 text-[22px] font-bold leading-tight">Registereintrag</h2>
            <p className="mb-2">
              <strong>Registergericht:</strong> {PLACEHOLDER}
            </p>
            <p>
              <strong>Registernummer:</strong> {PLACEHOLDER} (z. B. HRB …)
            </p>
            <p className="mt-2 text-[15px] text-secondary">
              Entfällt, sofern der Betreiber nicht im Handels-, Vereins-, Partnerschafts- oder
              Genossenschaftsregister eingetragen ist.
            </p>
          </section>

          {/* Umsatzsteuer-ID */}
          <section>
            <h2 className="mb-2 text-[22px] font-bold leading-tight">Umsatzsteuer-ID</h2>
            <p>
              <strong>USt-IdNr. gemäß § 27a UStG:</strong> {PLACEHOLDER}
            </p>
          </section>

          {/* Redaktionell Verantwortlicher */}
          <section>
            <h2 className="mb-2 text-[22px] font-bold leading-tight">
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
            <h2 className="mb-2 text-[22px] font-bold leading-tight">Haftungsausschluss</h2>
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
            <h2 className="mb-2 text-[22px] font-bold leading-tight">Urheberrecht</h2>
            <p>
              Alle Inhalte dieser Website, einschließlich Text, Bilder und Design, sind
              urheberrechtlich geschützt. Eine Vervielfältigung oder Weiterverbreitung bedarf der
              ausdrücklichen Genehmigung des Betreibers.
            </p>
          </section>

          {/* Data Protection */}
          <section>
            <h2 className="mb-2 text-[22px] font-bold leading-tight">Datenschutz</h2>
            <p>
              Informationen zur Verarbeitung personenbezogener Daten finden Sie in unserer{" "}
              <a href="/datenschutz" className="text-tint">
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
