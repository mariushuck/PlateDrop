# PlateDrop 🚗✉️

**PlateDrop** ist der asymmetrische, anonyme Briefkasten für KFZ-Kennzeichen in Deutschland.

Jeder kennt das Problem: Ein kaputtes Rücklicht, ein plattgedrückter Reifen oder ein blockiertes Garagentor im Vorbeifahren – aber man kann dem Fahrer keine Nachricht zukommen lassen. **PlateDrop** löst dies über einen asymmetrischen Kommunikationsansatz (Shadow-Drop).

## 🚀 Das Architektur-Konzept ("The Golden Middle Way")

Um maximale virale Reichweite bei 100%iger DSGVO-Konformität zu erreichen, trennt PlateDrop den Schreib- und Leseprozess strikt:

1. **Der Schreiber (Null Reibung):** Sieht ein Auto, geht auf die Web-App, gibt das Kennzeichen ein und schreibt eine Nachricht (z. B. _"Dein rechtes Bremslicht ist defekt"_). **Kein Login oder Account erforderlich.**
2. **Die Datenbank (Shadow-Drop):** Die Nachricht wird verschlüsselt gespeichert. Niemand im Internet kann diese Nachricht suchen oder einsehen. Sie existiert im "Schatten".
3. **Der Empfänger (Sicher & Privat):** Der Fahrzeughalter registriert sich, verifiziert sein Kennzeichen (z. B. via Upload des Fahrzeugscheins) und schaltet damit exklusiv seinen privaten Posteingang für dieses Kennzeichen frei.

## 🛠️ Tech Stack

- **Frontend:** Next.js 16 (App Router) & TypeScript
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

# Tests ausführen
npm run test

# Build für Produktion
npm run build
```

## 🎨 Features & Komponenten

### Phase 1-5: Core Functionality ✅

- Anonyme Nachrichtensubmission ohne Konto
- Deutsche Kennzeichen-Validierung & Normalisierung
- Server Actions für sichere Backend-Kommunikation
- Row-Level Security auf Datenbankebene
- Unit & Integration Tests (Jest, React Testing Library)

### Phase 6: UX Polishing & Legal Pages ✅

- **Toast-Benachrichtigungen:** `sonner` für elegante Erfolgs- und Fehlermeldungen
  - Success: `"Nachricht erfolgreich gedroppt! 🚗💨"`
  - Error: Detaillierte Validierungsmeldungen
- **Impressum** (`/impressum`): Deutsche Kontaktinformationen, Haftungsausschluss, Urheberrecht
- **Datenschutzerklärung** (`/datenschutz`): DSGVO-konforme Privacy Policy
  - Erklärt das Shadow-Drop-Konzept
  - Beschreibt Datenverschlüsselung in Supabase
  - Cookie-Policy (nur funktionale Authentifizierung)
  - DSGVO-Benutzerrechte
- **Footer-Komponente:** Mobile-first, verlinkt zu rechtlichen Seiten

## 📄 Seitennav (Öffentlich Erreichbar)

| Route          | Beschreibung                    | Auth-Schutz |
| -------------- | ------------------------------- | ----------- |
| `/`            | Anonymous Message Drop          | Nein        |
| `/impressum`   | Rechtliche Informationen        | Nein        |
| `/datenschutz` | Datenschutzerklärung (DSGVO)    | Nein        |
| `/auth/login`  | Login für Fahrzeugbesitzer      | Nein        |
| `/dashboard`   | Meine Nachrichten (Verifiziert) | **Ja**      |

## 🧪 Testing

```bash
# Alle Tests ausführen
npm run test

# Mit Coverage
npm run test -- --coverage

# Watch-Mode
npm run test -- --watch
```

**Test-Coverage:**

- `plateUtils.test.ts`: Deutsche Kennzeichen-Validierung & Normalisierung
- `ClaimPlateForm.test.tsx`: Fahrzeugverifikations-Formular

## 🚀 Deployment

Das Projekt ist produktionsbereit für die Veröffentlichung in Deutschland:

- ✅ DSGVO-konform (Privacy Policy, Cookie-Management)
- ✅ Mobile-First (Tailwind CSS responsive Design)
- ✅ Sicher (RLS, verschlüsselte Datenübertragung)
- ✅ Schnell (Next.js mit Server Actions)
- ✅ Getestet (Unit & Integration Tests)
