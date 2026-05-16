import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Datenschutzerklärung | PlateDrop",
  description: "Datenschutzerklärung und Datenschutzrichtlinien von PlateDrop",
};

export default function Datenschutz() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col items-center gap-1 px-4 py-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Datenschutzerklärung
          </h1>
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Wie wir deine Daten schützen
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-8 text-slate-700 dark:text-slate-300">
          {/* Introduction */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              1. Datenschutz bei PlateDrop
            </h2>
            <p>
              Der Schutz deiner Privatsphäre ist uns äußerst wichtig. PlateDrop
              folgt dem Prinzip der „Shadow-Drop" – einer asymmetrischen
              Datenschutzarchitektur, die es ermöglicht, Nachrichten anonym zu
              hinterlassen, ohne ein Benutzerkonto zu erstellen. Nachricht
              lesen? Dazu brauchst du ein verifiziertes Konto und Zugriff auf
              das entsprechende Fahrzeug.
            </p>
          </section>

          {/* Anonymous Messages */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              2. Anonyme Nachrichteneinträge (Shadow-Drop)
            </h2>
            <p className="mb-2">
              <strong>Keine Kontoerstellung erforderlich.</strong> Du kannst
              anonym eine Nachricht mit einem Kennzeichen hinterlassen, ohne
              dich anzumelden.
            </p>
            <p className="mb-2">
              <strong>Gespeicherte Daten:</strong> Jede Nachricht wird mit dem
              normalisierten Kennzeichen und dem Nachrichtentext in unserer
              Datenbank gespeichert.
            </p>
            <p>
              <strong>Keine IP-Protokollierung:</strong> Wir protokollieren
              deine IP-Adresse nicht beim Einreichen von Nachrichten. Du bleibst
              vollständig anonym.
            </p>
          </section>

          {/* Account & Authentication */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              3. Benutzerkonten und Authentifizierung
            </h2>
            <p className="mb-2">
              <strong>Optionales Konto:</strong> Um Nachrichten zu lesen, die
              für dich hinterlassen wurden, musst du ein Konto erstellen und
              registrieren.
            </p>
            <p className="mb-2">
              <strong>Authentifizierung über Supabase:</strong> Wir nutzen
              Supabase Auth für sichere Authentifizierung und
              Benutzerverwaltung. Deine Passwörter werden gehashed und nach den
              höchsten Sicherheitsstandards behandelt.
            </p>
            <p>
              <strong>Fahrzeugverifikation:</strong> Zum Lesen von Nachrichten
              musst du nachweisen, dass du der Besitzer des Fahrzeugs bist (z.B.
              durch Vorlage der Fahrzeugpapiere oder über eine kryptographische
              Verifikation).
            </p>
          </section>

          {/* Data Storage & Encryption */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              4. Datenspeicherung und Verschlüsselung
            </h2>
            <p className="mb-2">
              <strong>PostgreSQL-Datenbank:</strong> Alle Daten werden in einer
              PostgreSQL-Datenbank gehostet von Supabase gespeichert.
            </p>
            <p className="mb-2">
              <strong>Verschlüsselte Übertragung:</strong> Alle Daten werden
              über HTTPS übertragen und sind damit während der Übertragung
              verschlüsselt.
            </p>
            <p>
              <strong>Sicherheitsrichtlinien:</strong> Wir setzen Row-Level
              Security (RLS) ein, um sicherzustellen, dass nur verifizierte
              Fahrzeugbesitzer ihre eigenen Nachrichten lesen können.
            </p>
          </section>

          {/* Cookies */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              5. Cookies und Tracking
            </h2>
            <p className="mb-2">
              <strong>Funktionale Cookies:</strong> Wir verwenden Cookies
              <strong>nur</strong> für die Authentifizierung und
              Session-Verwaltung.
            </p>
            <p className="mb-2">
              <strong>Keine Tracking-Cookies:</strong> Wir setzen keine
              Analyse-, Werbe- oder Third-Party-Cookies ein.
            </p>
            <p>
              <strong>Session-Management:</strong> Authentifizierungs-Token
              werden in sicheren Cookies gespeichert und verfallen nach einer
              bestimmten Zeit.
            </p>
          </section>

          {/* Data Deletion */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              6. Datenlöschung
            </h2>
            <p className="mb-2">
              <strong>Benutzerkonto:</strong> Du kannst dein Benutzerkonto
              jederzeit löschen. Dies wird alle persönlichen Kontoinformationen
              entfernen.
            </p>
            <p>
              <strong>Nachrichten:</strong> Nachrichten werden nach einem
              bestimmten Zeitraum automatisch gelöscht (bei Bedarf können
              einzelne Nachrichten als unangemessen gemeldet und manuell
              gelöscht werden).
            </p>
          </section>

          {/* GDPR & Legal */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              7. DSGVO und Benutzerrechte
            </h2>
            <p className="mb-2">
              PlateDrop ist DSGVO-konform. Als Nutzer hast du das Recht auf:
            </p>
            <ul className="mb-4 list-inside list-disc space-y-1">
              <li>Auskunft über deine Daten</li>
              <li>Berichtigung fehlerhafter Daten</li>
              <li>Löschung deiner Daten (Recht auf Vergessenwerden)</li>
              <li>Datentransferabilität</li>
              <li>Widerspruch gegen Datenverarbeitung</li>
            </ul>
            <p>
              Wende dich bitte an{" "}
              <a
                href="mailto:privacy@platedrop.de"
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                privacy@platedrop.de
              </a>
              , um diese Rechte auszuüben.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">
              8. Datenschutzbeauftragte
            </h2>
            <p className="mb-2">
              <strong>Fragen zum Datenschutz?</strong> Kontaktiere uns gerne:
            </p>
            <p>
              <strong>Email:</strong>{" "}
              <a
                href="mailto:privacy@platedrop.de"
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                privacy@platedrop.de
              </a>
              <br />
              <strong>Telefon:</strong> +49 30 123456789
              <br />
              <strong>Adresse:</strong> PlateDrop GmbH, Beispielstraße 123,
              12345 Berlin
            </p>
          </section>

          {/* Last Updated */}
          <div className="mt-12 rounded-lg bg-slate-100 p-4 dark:bg-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              <strong>Letzte Aktualisierung:</strong> Mai 2026
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Diese Datenschutzerklärung kann jederzeit ohne vorherige
              Ankündigung aktualisiert werden.
            </p>
          </div>
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
