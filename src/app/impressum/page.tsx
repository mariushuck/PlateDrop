import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Impressum | PlateDrop",
  description: "Impressum und Kontaktinformationen von PlateDrop",
};

export default function Impressum() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col items-center gap-1 px-4 py-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Impressum</h1>
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Rechtliche Informationen
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-8 text-slate-700 dark:text-slate-300">
          {/* Responsible for Content */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              Verantwortlich für den Inhalt
            </h2>
            <p className="mb-2">
              <strong>PlateDrop GmbH</strong>
            </p>
            <p className="mb-2">
              Beispielstraße 123
              <br />
              12345 Berlin
              <br />
              Deutschland
            </p>
            <p>
              <strong>Email:</strong> contact@platedrop.de
              <br />
              <strong>Telefon:</strong> +49 30 123456789
            </p>
          </section>

          {/* VAT ID */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              Umsatzsteuer-ID
            </h2>
            <p>
              <strong>USt-ID:</strong> DE 123 456 789
            </p>
          </section>

          {/* Owner / Management */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              Geschäftsführung
            </h2>
            <p>
              <strong>Geschäftsführer:</strong> Max Mustermann, Erika Musterfrau
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
              ausdrücklichen Genehmigung durch PlateDrop GmbH.
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

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <p className="font-medium">Anonym. Schnell. Sicher.</p>

          <div className="flex gap-4">
            <a
              href="/impressum"
              className="hover:text-slate-900 transition-colors dark:hover:text-slate-200"
            >
              Impressum
            </a>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <a
              href="/datenschutz"
              className="hover:text-slate-900 transition-colors dark:hover:text-slate-200"
            >
              Datenschutz
            </a>
          </div>

          <p className="text-slate-500 dark:text-slate-500">
            © 2026 PlateDrop. Built with Next.js.
          </p>
        </div>
      </footer>
    </div>
  );
}
