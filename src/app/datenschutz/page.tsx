import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/ui/NavBar";

export const metadata: Metadata = {
  title: "Datenschutzerklärung | PlateDrop",
  description: "Datenschutzerklärung und Datenschutzrichtlinien von PlateDrop",
};

/**
 * TODO(go-live): Die mit „Platzhalter“ markierten Angaben (Verantwortlicher,
 * Hosting-Standort, zuständige Aufsichtsbehörde, ggf. Datenschutzbeauftragte)
 * durch die echten Werte des Betreibers ersetzen und juristisch prüfen lassen.
 * Der übrige Text beschreibt den tatsächlichen Stand der Anwendung.
 */
const PLACEHOLDER = "[Platzhalter – vor Go-Live ersetzen]";

// Liest die Speicherfrist zur Laufzeit; beim Docker-Build ist sie nicht gesetzt.
export const dynamic = "force-dynamic";

export default function Datenschutz() {
  // Pflichtvariable (docker-compose.yml); dieselbe Frist wendet prune-messages.mjs an.
  const retentionDays = process.env.MESSAGE_RETENTION_DAYS ?? PLACEHOLDER;

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
            <h1 className="large-title">Datenschutzerklärung</h1>
            <p className="mt-1 text-secondary">Informationen nach Art. 13, 14 DSGVO</p>
          </header>
          <p className="rounded-xl bg-surface p-4 text-[15px] text-warning">
            Hinweis: Verantwortlicher, Hosting-Standort und zuständige Aufsichtsbehörde sind noch
            Platzhalter und müssen vor dem produktiven Betrieb eingetragen werden.
          </p>

          {/* 1. Verantwortlicher */}
          <section>
            <h2 className="mb-2 text-[22px] font-bold leading-tight">1. Verantwortlicher</h2>
            <p className="mb-2">
              Verantwortlich für die Verarbeitung personenbezogener Daten auf dieser Website ist der
              im{" "}
              <a href="/impressum" className="text-tint">
                Impressum
              </a>{" "}
              genannte Betreiber ({PLACEHOLDER}).
            </p>
            <p>
              Einen Datenschutzbeauftragten hat der Betreiber {PLACEHOLDER} benannt / nicht benannt
              (§ 38 BDSG). Anfragen zum Datenschutz: {PLACEHOLDER}.
            </p>
          </section>

          {/* 2. Grundprinzip */}
          <section>
            <h2 className="mb-2 text-[22px] font-bold leading-tight">
              2. Grundprinzip „Shadow-Drop“
            </h2>
            <p>
              PlateDrop trennt Schreiben und Lesen: Eine Nachricht an ein Kennzeichen kann jede
              Person <strong>ohne Konto und ohne Anmeldung</strong> hinterlassen. Lesen kann eine
              Nachricht nur, wer ein bestätigtes Konto besitzt und das betroffene Kennzeichen als
              Halter:in verifiziert hat. Weil Kennzeichen neu vergeben werden, sieht eine Halter:in
              nur Nachrichten, die frühestens 30 Tage vor der Registrierung des Kennzeichens
              eingegangen sind – ältere können an eine frühere Halter:in gerichtet sein.
            </p>
          </section>

          {/* 3. Anonyme Nachrichten */}
          <section>
            <h2 className="mb-2 text-[22px] font-bold leading-tight">3. Anonyme Nachrichten</h2>
            <p className="mb-2">
              <strong>Gespeicherte Daten:</strong> das normalisierte Kennzeichen, die gewählte
              vordefinierte Nachricht (z. B. „Licht ist an“) und der Zeitpunkt der Einreichung.
              Freitext können anonyme Absender nicht eingeben. Es wird{" "}
              <strong>kein Absenderkennzeichen</strong> gespeichert – weder Name noch Konto noch
              IP-Adresse.
            </p>
            <p className="mb-2">
              <strong>Spam-Schutz:</strong> Zur Begrenzung von Missbrauch bildet der Server aus der
              IP-Adresse der einreichenden Person einen{" "}
              <strong>gesalzenen, täglich wechselnden SHA-256-Hash</strong> und zählt damit Anfragen
              pro Minute. Die IP-Adresse selbst wird dabei <strong>nicht</strong> gespeichert; der
              Hash ist nicht auf die IP zurückführbar und wechselt täglich.
            </p>
            <p>
              <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f DSGVO – berechtigtes Interesse
              an einem funktionsfähigen, missbrauchsgeschützten Dienst und am Schutz der
              angeschriebenen Halter:innen.
            </p>
            <p className="mt-2">
              <strong>Ausblenden und Melden:</strong> Empfänger:innen können eine Nachricht
              ausblenden oder dem Betreiber melden. Gespeichert werden dabei der Zeitpunkt, bei
              einer Meldung zusätzlich das meldende Konto und der gewählte Grund. Eine gemeldete
              Nachricht sieht der Betreiber, um über ihre Löschung zu entscheiden (Art. 16 DSA);
              alle übrigen Nachrichten bleiben auch für ihn unsichtbar. Rechtsgrundlage ist Art. 6
              Abs. 1 lit. c und f DSGVO.
            </p>
          </section>

          {/* 4. Konto und Authentifizierung */}
          <section>
            <h2 className="mb-2 text-[22px] font-bold leading-tight">
              4. Konto und Authentifizierung
            </h2>
            <p className="mb-2">
              <strong>Erhobene Daten:</strong> E-Mail-Adresse, ein Passwort-Hash (Verfahren: scrypt
              – das Passwort im Klartext wird nie gespeichert), der Bestätigungsstatus der E-Mail
              sowie Erstell- und Änderungszeitpunkt.
            </p>
            <p className="mb-2">
              <strong>Sitzungsdaten:</strong> Für jede Anmeldung werden ein Sitzungs-Token, der
              Zeitpunkt, die <strong>IP-Adresse</strong> und die Browser-Kennung (User-Agent)
              gespeichert. Diese Sitzungsdaten – einschließlich der IP – werden gelöscht, sobald die
              Sitzung abläuft und die regelmäßige Bereinigung läuft.
            </p>
            <p className="mb-2">
              <strong>Technische Umsetzung:</strong> Konten und Sitzungen verwaltet die Bibliothek{" "}
              <em>better-auth</em> in der anwendungseigenen PostgreSQL-Datenbank. Es kommt{" "}
              <strong>kein externer Authentifizierungsdienst</strong> zum Einsatz.
            </p>
            <p>
              <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung –
              Bereitstellung des Lesezugangs) sowie lit. f (IT-Sicherheit der Sitzungsverwaltung).
            </p>
          </section>

          {/* 5. Kennzeichen-Verifizierung */}
          <section>
            <h2 className="mb-2 text-[22px] font-bold leading-tight">
              5. Verifizierung eines Kennzeichens
            </h2>
            <p className="mb-2">
              Wer Nachrichten lesen möchte, meldet ein Kennzeichen an, erhält einen Prüfcode, legt
              ihn sichtbar hinter die Windschutzscheibe und lädt ein <strong>Foto</strong> hoch. Ein
              Mensch (Administrator) prüft das Foto und gibt das Kennzeichen frei oder lehnt es ab.
              Eine automatisierte Bildauswertung findet nicht statt.
            </p>
            <p className="mb-2">
              <strong>Gespeicherte Daten:</strong> das Kennzeichen, der Prüfcode, der
              Bearbeitungsstatus sowie das hochgeladene Foto. Das Foto zeigt das Kennzeichen und
              dessen Umfeld und kann daher weitere personenbezogene Daten enthalten (z. B. Fahrzeug,
              Örtlichkeit, unbeteiligte Personen). Die Fotos liegen im Dateisystem des Servers und
              sind nur nach erneuter Zugriffsprüfung abrufbar.
            </p>
            <p>
              <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO – Nachweis der
              Haltereigenschaft als Voraussetzung für den Lesezugang.
            </p>
          </section>

          {/* 5a. Gelände und Organisationen */}
          <section>
            <h2 className="mb-2 text-[22px] font-bold leading-tight">
              5a. Gelände und Organisationen
            </h2>
            <p className="mb-2">
              Betreiber privater Gelände (z. B. Arbeitgeber, Hausverwaltungen) können PlateDrop für
              ihre Parkflächen nutzen. Für die Daten in diesem Rahmen ist die jeweilige Organisation
              Verantwortliche; PlateDrop verarbeitet sie in ihrem Auftrag (Art. 28 DSGVO).
            </p>
            <p className="mb-2">
              <strong>Gespeicherte Daten:</strong> deine Mitgliedschaft an einem Standort samt
              Status, die Kennzeichen, die du dort einträgst, und Nachrichten, die über den Code
              eines Standorts gesendet werden. Schreibst du angemeldet über einen Standort, wird
              dein Konto als Absender gespeichert; sichtbar ist für die Empfänger:in nur dein
              freiwilliger Anzeigename und nur, wenn die Organisation das eingestellt hat. Besucher
              ohne Konto bleiben anonym.
            </p>
            <p className="mb-2">
              <strong>Was die Verwaltung sieht:</strong> E-Mail-Adresse und Anzeigename der
              Mitglieder und Antragsteller:innen, ihre Kennzeichen in der Organisation und die Zahl
              der Nachrichten je Woche und Standort. Den Inhalt von Nachrichten sieht sie nicht.
            </p>
            <p>
              <strong>Ende:</strong> Trittst du aus oder entfernt dich die Verwaltung, endet der
              Zugriff sofort und deine Kennzeichen in der Organisation verfallen. Endet der Vertrag
              mit der Organisation, werden ihre Daten exportiert und gelöscht; dein Konto und deine
              übrigen Kennzeichen bleiben bestehen.
            </p>
          </section>

          {/* 6. E-Mail-Versand */}
          <section>
            <h2 className="mb-2 text-[22px] font-bold leading-tight">6. E-Mail-Versand</h2>
            <p className="mb-2">
              Zur Bestätigung der E-Mail-Adresse, für die Passwort-Zurücksetzung und für die
              Bestätigung einer E-Mail-Änderung versendet PlateDrop E-Mails an die Adresse der
              jeweiligen Nutzer:in. Verifizierte Halter:innen erhalten außerdem eine
              Benachrichtigung, wenn eine Nachricht an ihr Kennzeichen eingeht; sie nennt nur die
              Art der Nachricht und das Kennzeichen. Benachrichtigungen lassen sich in den
              Kontoeinstellungen abschalten, mit Ruhezeiten versehen oder je Kennzeichen pausieren.
              Der Versand läuft über einen vom Betreiber konfigurierten SMTP-Dienst ({PLACEHOLDER} –
              Anbieter im Auftragsverarbeitungs- vertrag). Übermittelt werden Empfängeradresse und
              E-Mail-Inhalt.
            </p>
            <p>
              <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b und lit. f DSGVO.
            </p>
          </section>

          {/* 7. Hosting und Empfänger */}
          <section>
            <h2 className="mb-2 text-[22px] font-bold leading-tight">
              7. Hosting und Empfänger der Daten
            </h2>
            <ul className="mb-2 list-disc pl-5 space-y-1">
              <li>
                <strong>Server-Hosting:</strong> {PLACEHOLDER} (Anbieter und Standort;
                Auftragsverarbeitungsvertrag nach Art. 28 DSGVO). Auf diesem Server laufen die
                Anwendung, die PostgreSQL-Datenbank und die Ablage der Beweisfotos.
              </li>
              <li>
                <strong>E-Mail-Zustellung:</strong> SMTP-Dienst {PLACEHOLDER} (siehe Abschnitt 6).
              </li>
              <li>
                <strong>Schriftarten:</strong> Die verwendeten Schriften (Geist) werden zur Bauzeit
                heruntergeladen und vom eigenen Server ausgeliefert. Beim Aufruf der Seite werden{" "}
                <strong>keine</strong> Daten an Google übertragen.
              </li>
            </ul>
            <p>
              Eine Übermittlung in Drittländer außerhalb der EU/des EWR findet nicht statt bzw. nur
              auf Grundlage geeigneter Garantien ({PLACEHOLDER} – abhängig vom gewählten Hosting).
            </p>
          </section>

          {/* 8. Cookies */}
          <section>
            <h2 className="mb-2 text-[22px] font-bold leading-tight">
              8. Cookies und lokaler Speicher
            </h2>
            <p className="mb-2">
              PlateDrop setzt ausschließlich ein <strong>technisch notwendiges Cookie</strong> für
              die angemeldete Sitzung (HttpOnly). Es dient allein der Authentifizierung.
            </p>
            <p className="mb-2">
              Wählst du über den Schalter in der Navigationsleiste eine feste Darstellung (hell oder
              dunkel), wird diese Wahl im lokalen Speicher deines Browsers abgelegt (Eintrag{" "}
              <code>theme</code>). Sie verlässt dein Gerät nicht und wird nicht an uns übertragen.
              Mit „Automatisch“ wird der Eintrag wieder gelöscht.
            </p>
            <p>
              Es werden <strong>keine</strong> Analyse-, Werbe- oder Drittanbieter-Cookies gesetzt.
              Eine Einwilligung nach § 25 Abs. 1 TDDDG ist daher nicht erforderlich (§ 25 Abs. 2 Nr.
              2 TDDDG – die Darstellung wird nur auf deinen ausdrücklichen Wunsch gespeichert).
              Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.
            </p>
          </section>

          {/* 9. Speicherdauer */}
          <section>
            <h2 className="mb-2 text-[22px] font-bold leading-tight">9. Speicherdauer</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Nachrichten:</strong> höchstens {retentionDays} Tage ab Eingang; danach
                werden sie durch eine regelmäßige Bereinigung gelöscht. Ausgeblendete Nachrichten
                bleiben bis dahin gespeichert, damit eine Meldung noch geprüft werden kann. Der
                Betreiber kann eine gemeldete Nachricht früher löschen.
              </li>
              <li>
                <strong>Benachrichtigungen:</strong> der Versandauftrag (Konto, Kennzeichen, Art der
                Nachricht, Zeitpunkt) wird 30 Tage nach dem Versand gelöscht, die Einstellungen mit
                dem Konto.
              </li>
              <li>
                <strong>Meldungen:</strong> zusammen mit der gemeldeten Nachricht, also ebenfalls
                höchstens {retentionDays} Tage.
              </li>
              <li>
                <strong>Konto- und Verifizierungsdaten:</strong> für die Dauer des Kontos; nach
                einer Löschung des Kontos werden sie samt zugehöriger Kennzeichen und Beweisfotos
                entfernt.
              </li>
              <li>
                <strong>Sitzungsdaten (inkl. IP):</strong> bis zum Ablauf der Sitzung; die
                abgelaufenen Datensätze werden durch eine regelmäßige Bereinigung gelöscht.
              </li>
              <li>
                <strong>Spam-Schutz-Hashes:</strong> nur für das jeweilige Zeitfenster relevant und
                ohne Personenbezug rekonstruierbar.
              </li>
              <li>
                <strong>Beweisfotos:</strong> bis das zugehörige Kennzeichen gelöscht oder ein neues
                Foto hochgeladen wird.
              </li>
            </ul>
          </section>

          {/* 10. Rechte der betroffenen Personen */}
          <section>
            <h2 className="mb-2 text-[22px] font-bold leading-tight">10. Deine Rechte</h2>
            <p className="mb-2">Nach der DSGVO hast du das Recht auf:</p>
            <ul className="mb-4 list-disc pl-5 space-y-1">
              <li>Auskunft (Art. 15)</li>
              <li>Berichtigung (Art. 16)</li>
              <li>Löschung (Art. 17)</li>
              <li>Einschränkung der Verarbeitung (Art. 18)</li>
              <li>Datenübertragbarkeit (Art. 20)</li>
              <li>Widerspruch gegen Verarbeitungen auf Basis von Art. 6 Abs. 1 lit. f (Art. 21)</li>
            </ul>
            <p className="mb-2">
              Zur Ausübung genügt eine formlose E-Mail an {PLACEHOLDER}. In den Kontoeinstellungen
              kannst du deine Daten außerdem selbst als Datei exportieren und dein Konto löschen;
              darüber hinausgehende Anträge bearbeitet der Betrieb manuell.
            </p>
            <p>
              Außerdem besteht ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde,
              insbesondere der für den Betreiber zuständigen Behörde ({PLACEHOLDER}).
            </p>
          </section>

          {/* 11. Pflicht zur Bereitstellung */}
          <section>
            <h2 className="mb-2 text-[22px] font-bold leading-tight">
              11. Erforderlichkeit der Daten
            </h2>
            <p>
              Für das anonyme Hinterlassen einer Nachricht ist kein personenbezogenes Datum
              erforderlich. Für den Lesezugang sind E-Mail-Adresse, Passwort und die
              Kennzeichen-Verifizierung notwendig; ohne diese Angaben kann der Lesezugang nicht
              bereitgestellt werden.
            </p>
          </section>

          {/* Last Updated */}
          <div className="mt-12 rounded-xl bg-surface p-4">
            <p className="text-[15px] text-secondary">
              <strong>Stand:</strong> Oktober 2026
            </p>
            <p className="text-[15px] text-secondary">
              Diese Datenschutzerklärung wird angepasst, sobald sich die beschriebene Verarbeitung
              ändert.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
