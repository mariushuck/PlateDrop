# PlateDrop 🚗✉️

**PlateDrop** ist der asymmetrische, anonyme Briefkasten für KFZ-Kennzeichen in Deutschland.

Jeder kennt das Problem: Ein kaputtes Rücklicht, ein plattgedrückter Reifen oder ein blockiertes Garagentor im Vorbeifahren – aber man kann dem Fahrer keine Nachricht zukommen lassen. **PlateDrop** löst dies über einen asymmetrischen Kommunikationsansatz (Shadow-Drop).

## 🚀 Das Architektur-Konzept ("The Golden Middle Way")

Um maximale virale Reichweite bei 100%iger DSGVO-Konformität zu erreichen, trennt PlateDrop den Schreib- und Leseprozess strikt:

1. **Der Schreiber (Null Reibung):** Sieht ein Auto, geht auf die Web-App, gibt das Kennzeichen ein und schreibt eine Nachricht (z. B. _"Dein rechtes Bremslicht ist defekt"_). **Kein Login oder Account erforderlich.**
2. **Die Datenbank (Shadow-Drop):** Die Nachricht wird verschlüsselt gespeichert. Niemand im Internet kann diese Nachricht suchen oder einsehen. Sie existiert im "Schatten".
3. **Der Empfänger (Sicher & Privat):** Der Fahrzeughalter registriert sich, verifiziert sein Kennzeichen (z. B. via Upload des Fahrzeugscheins) und schaltet damit exklusiv seinen privaten Posteingang für dieses Kennzeichen frei.

## 🛠️ Tech Stack

- **Frontend:** Next.js 15 (App Router) & TypeScript
- **Styling:** Tailwind CSS (Strikt Mobile-First für die spätere native Portierung)
- **Backend/Datenbank:** Supabase (PostgreSQL mit Row-Level Security)
- **Mobile-Brücke (Geplant):** Capacitor für die native Kompilierung zu iOS & Android

## 🔒 Datenbank & RLS-Logik (Sicherheitskern)

Die Datensicherheit wird direkt auf PostgreSQL-Ebene über **Row-Level Security (RLS)** erzwungen:

- **Tabelle `messages`:**
  - `INSERT`-Policy: `true` (Erlaubt anonyme Einwürfe von überall).
  - `SELECT`-Policy: Erlaubt nur, wenn die `auth.uid()` des aktuellen Nutzers in der Tabelle `verified_plates` mit dem Status `is_verified = true` für dieses Kennzeichen hinterlegt ist.

## 📦 Installation & Entwicklung

```bash
# Abhängigkeiten installieren
npm install

# Entwicklungsserver starten
npm run dev
```
