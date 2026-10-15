import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/ui/NavBar";

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
    <div className="flex flex-1 flex-col">
      <NavBar>
        <Link href="/" className="text-[17px] font-semibold active:opacity-60">
          PlateDrop
        </Link>
      </NavBar>

      <main className="mx-auto w-full max-w-xl space-y-9 px-4 pt-6 pb-8">
        <header>
          <h1 className="large-title">Den Halter in Minuten erreichen – ohne Rundmail.</h1>
          <p className="mt-3 text-[17px] leading-relaxed text-secondary">
            Firmenparkplatz, Tiefgarage einer Wohnanlage, Hotel, Klinik oder Vereinsgelände: Wenn
            ein Fahrzeug eine Ausfahrt blockiert oder das Licht brennt, erreicht PlateDrop den
            Halter direkt. Niemand muss Telefonnummern herausgeben.
          </p>
        </header>

        <section>
          <h2 className="section-header">So funktioniert es</h2>
          <ol className="inset-group">
            {steps.map((step, index) => (
              <li key={step.title} className="list-row items-start">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tint text-[15px] font-semibold text-white">
                  {index + 1}
                </span>
                <div>
                  <p className="text-[17px] font-semibold">{step.title}</p>
                  <p className="mt-0.5 text-[15px] text-secondary">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="section-header">Datenschutz eingebaut</h2>
          <ul className="inset-group text-[15px]">
            {[
              "Keine Ortsdaten, keine Auswertung pro Person – nur Vorfälle je Woche und Standort.",
              "Verwaltungen lesen keine Nachrichten ihrer Mitglieder.",
              "Absendernamen nur, wenn Sie es einstellen; Besucher bleiben immer anonym.",
              "Selbst betrieben in Deutschland, Auftragsverarbeitungsvertrag inklusive.",
            ].map((point) => (
              <li key={point} className="list-row items-start">
                <ShieldCheck
                  className="mt-0.5 shrink-0 text-success"
                  size={20}
                  aria-hidden="true"
                />
                {point}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="section-header">Pilot anfragen</h2>
          <div className="inset-group space-y-3 p-4">
            <p className="text-[15px]">
              Drei Monate kostenlos für ein Gelände, mit vorher vereinbartem Preis für danach.
            </p>
            {hasContact ? (
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=PlateDrop%20Pilot`}
                className="btn btn-primary w-full"
              >
                {CONTACT_EMAIL}
              </a>
            ) : (
              <p className="text-[15px] font-semibold">Kontakt: {CONTACT_EMAIL}</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
