# PlateDrop

PlateDrop ist eine privacy-first Web-App für deutsche Kennzeichen. Nachrichten können anonym an ein Kennzeichen gesendet werden. Lesen dürfen sie nur angemeldete Nutzer, die das jeweilige Kennzeichen verifiziert haben.

## Kernidee

PlateDrop trennt Schreiben und Lesen bewusst voneinander:

1. Öffentlich kann jede Person eine Nachricht an ein Kennzeichen senden, ohne Konto und ohne Login.
2. Beim Speichern wird das Kennzeichen normalisiert, damit Eingaben wie Leerzeichen, Bindestriche und Kleinbuchstaben konsistent verarbeitet werden.
3. Lesen ist nur nach Anmeldung und Kennzeichen-Claim möglich. Verifizierte Kennzeichen werden im Dashboard angezeigt.
4. Ein Admin kann ausstehende Verifizierungen prüfen und freigeben oder ablehnen.

## Tech Stack

- Next.js 16 mit App Router
- React 19
- TypeScript im Strict Mode
- Tailwind CSS 4
- Supabase für Auth, Datenbank und Storage
- Jest und React Testing Library für Tests
- `sonner` für Toasts
- Biome für Linting und Formatierung

## Wichtige Flows

- Öffentliches Drop-Formular auf `/`: Kennzeichen eingeben, Nachricht senden, Server Action schreibt in `messages`.
- Anmeldung auf `/login`: Sign-in und Sign-up mit Supabase Auth.
- Dashboard auf `/dashboard`: Kennzeichen registrieren, Verifizierungsstatus prüfen, Beweisfoto hochladen und Nachrichten der verifizierten Kennzeichen lesen.
- Admin-Ansicht auf `/admin`: Offene Verifizierungen mit Proof-Bild prüfen.

## Daten- und Sicherheitsmodell

- `messages` erlaubt öffentliche Inserts.
- `messages` ist beim Lesen durch RLS auf verifizierte Kennzeichen begrenzt.
- Das anonyme Senden ist rate-limitiert: pro IP über einen pseudonymisierten, täglich rotierenden SHA-256-Hash (RPC `check_message_rate`) und pro Kennzeichen über einen DB-Trigger (`enforce_message_rate_limit`) als Backstop. DSGVO-konform, da keine Klartext-IP gespeichert wird.
- `verified_plates` speichert Claims, Verifizierungsstatus und Proof-Upload-Referenzen.
- Proof-Bilder liegen in einem privaten Supabase-Storage-Bucket (`proofs`); die Admin-Ansicht greift über kurzlebige signierte URLs zu, nie über öffentliche URLs.
- Die Kennzeichenlogik liegt in `src/lib/utils/plateUtils.ts` und akzeptiert gängige deutsche Formate inklusive E- und H-Kennzeichen.

## Verfügbare Routen

| Route                   | Beschreibung                                                 | Zugriff                                            |
| ----------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| `/`                     | Anonyme Nachricht an ein Kennzeichen senden                  | Öffentlich                                         |
| `/login`                | Anmeldung und Registrierung                                  | Öffentlich                                         |
| `/forgot-password`      | Passwort-Reset anfordern                                     | Öffentlich                                         |
| `/reset-password`       | Neues Passwort setzen (via Reset-Link)                       | Öffentlich                                         |
| `/dashboard`            | Kennzeichen registrieren, Proof hochladen, Nachrichten lesen | Authentifiziert                                    |
| `/dashboard/settings`   | E-Mail und Passwort ändern                                   | Authentifiziert                                    |
| `/admin`                | Ausstehende Verifizierungen prüfen                           | Authentifiziert, Admin-Logik in den Server Actions |
| `/impressum`            | Impressum                                                    | Öffentlich                                         |
| `/datenschutz`          | Datenschutzerklärung                                         | Öffentlich                                         |

## Entwicklung

```bash
pnpm install
pnpm dev
```

### Environment-Variablen

In `.env.local` werden folgende Variablen benötigt:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
RATE_LIMIT_SALT=          # geheimes Salt zum Hashen der Client-IPs im Nachrichten-Rate-Limiter
```

Weitere hilfreiche Scripts:

```bash
pnpm lint
pnpm check
pnpm format
pnpm test
pnpm test:watch
pnpm build
pnpm start
```

## Tests

- `__tests__/utils/plateUtils.test.ts`: Normalisierung und Validierung von Kennzeichen
- `__tests__/components/ClaimPlateForm.test.tsx`: Claim-Formular und Validierung

## Projektstruktur

- `src/app/actions.ts`: Öffentliche Nachrichtenerstellung
- `src/app/dashboard/actions.ts`: Kennzeichen-Claim und Proof-Upload
- `src/app/dashboard/settings/actions.ts`: E-Mail- und Passwortänderung
- `src/app/admin/actions.ts`: Admin-Genehmigung und Ablehnung
- `src/app/auth/actions.ts`: Sign-in, Sign-up und Sign-out
- `src/app/forgot-password/actions.ts`: Passwort-Reset-E-Mail versenden
- `src/components/features/ClaimPlateForm.tsx`: Formular zum Registrieren eines Kennzeichens
- `src/lib/utils/plateUtils.ts`: Kennzeichen-Normalisierung und -Validierung
- `src/lib/utils/rateLimit.ts`: IP-Extraktion und pseudonymisiertes Hashing für den Rate-Limiter

## Status

Die App ist als mobile-first Webanwendung aufgebaut und für den laufenden Ausbau mit Supabase, Server Actions und RLS vorbereitet.
