import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Für Betreiber | PlateDrop",
  description:
    "PlateDrop für Firmenparkplätze, Wohnanlagen und private Parkflächen: Halter in Minuten erreichen, ohne Rundmail und ohne Telefonnummern.",
};

/**
 * TODO(go-live): Kontaktadresse eintragen (dieselbe Domain wie die
 * Datenschutzanfragen, siehe TODO.md P0). Solange sie fehlt, erscheint kein
 * mailto-Link.
 */
const CONTACT_EMAIL = "[Platzhalter – vor Go-Live ersetzen]";

const steps = [
  {
    title: "Gelände einrichten",
    text: "Wir legen Ihre Organisation und Standorte an. Für jeden Standort drucken Sie einen Aushang mit QR-Code.",
  },
  {
    title: "Mitglieder treten bei",
    text: "Mitarbeitende oder Bewohner scannen den Code, melden sich an und beantragen den Beitritt. Sie bestätigen – Mieterlisten müssen nicht weitergegeben werden.",
  },
  {
    title: "Kennzeichen freigeben",
    text: "Mitglieder tragen ihre Kennzeichen ein, Sie geben frei – oder hinterlegen eine Fuhrpark- bzw. Parkausweisliste, dann geht es sofort.",
  },
  {
    title: "Halter erreichen",
    text: "Wer ein blockierendes Fahrzeug sieht, scannt den Code am Standort und wählt eine Nachricht. Der Halter bekommt eine E-Mail.",
  },
];

/** Statische Seite für Facility Management, Hausverwaltungen und private Betreiber. */
export default function BetreiberPage() {
  const hasContact = CONTACT_EMAIL.includes("@");

  return (
    <main className="mx-auto max-w-2xl space-y-10 px-4 py-10 text-slate-900 dark:text-white">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Für Betreiber privater Gelände
        </p>
        <h1 className="text-3xl font-bold">Den Halter in Minuten erreichen – ohne Rundmail.</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Firmenparkplatz, Tiefgarage einer Wohnanlage, Hotel, Klinik oder Vereinsgelände: Wenn ein
          Fahrzeug eine Ausfahrt blockiert oder das Licht brennt, erreicht PlateDrop den Halter
          direkt. Niemand muss Telefonnummern herausgeben.
        </p>
      </header>

      <ol className="space-y-4">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
          >
            <p className="font-semibold">
              {index + 1}. {step.title}
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{step.text}</p>
          </li>
        ))}
      </ol>

      <section className="space-y-2">
        <h2 className="text-xl font-bold">Datenschutz eingebaut</h2>
        <ul className="list-inside list-disc space-y-1 text-sm text-slate-600 dark:text-slate-300">
          <li>
            Keine Ortsdaten, keine Auswertung pro Person – nur Vorfälle je Woche und Standort.
          </li>
          <li>Verwaltungen lesen keine Nachrichten ihrer Mitglieder.</li>
          <li>Absendernamen nur, wenn Sie es einstellen; Besucher bleiben immer anonym.</li>
          <li>Selbst betrieben in Deutschland, Auftragsverarbeitungsvertrag inklusive.</li>
        </ul>
      </section>

      <section className="space-y-3 rounded-lg bg-slate-100 p-6 dark:bg-slate-800">
        <h2 className="text-xl font-bold">Pilot anfragen</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Drei Monate kostenlos für ein Gelände, mit vorher vereinbartem Preis für danach.
        </p>
        {hasContact ? (
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=PlateDrop%20Pilot`}
            className="inline-block rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white dark:bg-white dark:text-slate-900"
          >
            {CONTACT_EMAIL}
          </a>
        ) : (
          <p className="text-sm font-semibold">Kontakt: {CONTACT_EMAIL}</p>
        )}
      </section>

      <Link href="/" className="text-sm font-semibold underline">
        Zur Startseite
      </Link>
    </main>
  );
}
