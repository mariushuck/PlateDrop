# PlateDrop

PlateDrop ist eine privacy-first Web-App für deutsche Kennzeichen. Nachrichten können anonym an ein Kennzeichen gesendet werden. Lesen dürfen sie nur angemeldete Nutzer, die das jeweilige Kennzeichen verifiziert haben.

Die Anwendung läuft vollständig selbst betrieben: eigener Postgres, eigene Auth, eigener Dateispeicher, eigener Mailversand — je ein Container, optional hinter einem Reverse Proxy.

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
- PostgreSQL 18, angesprochen über `pg` mit handgeschriebenem SQL
- [better-auth](https://better-auth.com) für Registrierung, Anmeldung, Sessions und Passwort-Reset
- `nodemailer` für den Mailversand, Mailpit als Auffangserver in der Entwicklung
- Docker Compose für Datenbank, App, Mail und optionalen Caddy-Proxy
- Jest und React Testing Library für Tests
- `sonner` für Toasts
- Biome für Linting und Formatierung

## Wichtige Flows

- Öffentliches Drop-Formular auf `/`: Kennzeichen eingeben, Nachricht senden, Server Action schreibt in `messages`.
- Registrierung auf `/login`: Nach der Anmeldung wird eine Bestätigungsmail verschickt. Erst mit bestätigter Adresse ist ein Login möglich.
- Dashboard auf `/dashboard`: Kennzeichen registrieren, Verifizierungsstatus prüfen, Beweisfoto hochladen und Nachrichten der verifizierten Kennzeichen lesen.
- Admin-Ansicht auf `/admin`: Offene Verifizierungen mit Proof-Bild prüfen.

## Daten- und Sicherheitsmodell

Das asymmetrische Modell — öffentlich schreiben, nur der verifizierte Halter liest — wird auf zwei Ebenen durchgesetzt.

**In der Datenbank (Row Level Security).** Die Anwendung verbindet sich als Rolle `platedrop_app`. Diese Rolle besitzt keine Tabellen, hat kein `BYPASSRLS` und nur die nötigen Rechte — die Policies greifen also wirklich. Wer gerade fragt, erfährt die Datenbank über eine **transaktionslokale** Session-Variable, die `withUser()` in `src/lib/db/context.ts` setzt; die Policies lesen sie über `app.current_user_id()`. Transaktionslokal heißt: der Wert verschwindet mit COMMIT oder ROLLBACK und kann nicht an die nächste Anfrage durchsickern, die dieselbe Verbindung aus dem Pool bekommt.

**In der Anwendung.** Jede Query in `src/lib/db/queries.ts` filtert zusätzlich explizit nach `user_id`, und die Admin-Server-Actions prüfen das Session-Flag, bevor sie die Datenbank überhaupt fragen. Weder ein vergessener Filter noch eine fehlerhafte Policy führt allein zu einem Datenleck.

Weiteres:

- `messages` erlaubt öffentliche Inserts, ist beim Lesen aber auf verifizierte Kennzeichen des Anfragenden begrenzt. Ändern und Löschen ist der App-Rolle gar nicht erst gestattet.
- Das anonyme Senden ist doppelt rate-limitiert: pro Absender über einen pseudonymisierten, täglich rotierenden SHA-256-Hash der IP (`check_message_rate`, 10/Minute) und pro Kennzeichen über einen DB-Trigger (`enforce_message_rate_limit`, 20/Stunde). DSGVO-konform, da keine Klartext-IP gespeichert wird.
- Beweisfotos liegen in einem Docker-Volume und werden ausschließlich über `/api/proofs/…` ausgeliefert. Diese Route prüft bei **jedem** Abruf Session und Berechtigung — anders als eine vorab ausgestellte Signed URL endet der Zugriff sofort, wenn ein Kennzeichen abgelehnt oder gelöscht wird.
- Admin-Rechte sind über die Anwendung nicht änderbar. Sie werden ausschließlich per Skript mit Datenbank-Owner-Zugang vergeben (siehe unten).
- Die Kennzeichenlogik liegt in `src/lib/utils/plateUtils.ts` und akzeptiert gängige deutsche Formate inklusive E- und H-Kennzeichen.

## Verfügbare Routen

| Route                    | Beschreibung                                                 | Zugriff                          |
| ------------------------ | ------------------------------------------------------------ | -------------------------------- |
| `/`                      | Anonyme Nachricht an ein Kennzeichen senden                  | Öffentlich                       |
| `/login`                 | Anmeldung und Registrierung                                  | Öffentlich                       |
| `/forgot-password`       | Passwort-Reset anfordern                                     | Öffentlich                       |
| `/reset-password`        | Neues Passwort setzen (Token aus der E-Mail)                 | Öffentlich                       |
| `/dashboard`             | Kennzeichen registrieren, Proof hochladen, Nachrichten lesen | Authentifiziert                  |
| `/dashboard/settings`    | E-Mail und Passwort ändern                                   | Authentifiziert                  |
| `/admin`                 | Ausstehende Verifizierungen prüfen                           | Authentifiziert + Admin          |
| `/impressum`             | Impressum                                                    | Öffentlich                       |
| `/datenschutz`           | Datenschutzerklärung                                         | Öffentlich                       |
| `/api/auth/[...all]`     | Endpunkte von better-auth, Ziel der Links aus den E-Mails    | Öffentlich                       |
| `/api/proofs/[...path]`  | Beweisfoto ausliefern                                        | Halter oder Admin, pro Abruf geprüft |

## Entwicklung

### Mit Docker (empfohlen)

```bash
cp .env.example .env      # Passwörter und Secrets eintragen
docker compose up -d      # db + web + mailpit, mit Hot Reload
```

- App: http://localhost:3000
- Postfach (Mailpit): http://localhost:8025 — hier landen alle E-Mails
- Postgres: `localhost:5432`

Die Migrationen spielt der One-shot-Service `migrate` vor dem Start der App ein.

```bash
docker compose logs -f web    # Logs
docker compose down           # Stoppen
docker compose down -v        # Stoppen und Daten verwerfen
```

### Ohne Docker

Nur die Datenbank im Container starten, den Rest lokal:

```bash
docker compose up -d db mailpit
# In .env.local: `db` durch `localhost` ersetzen und PROOFS_DIR auf ./.data/proofs setzen
pnpm install
pnpm db:migrate
pnpm dev
```

### Ein Konto zum Admin machen

```bash
docker compose run --rm migrate node scripts/set-admin.mjs halter@example.com
docker compose run --rm migrate node scripts/set-admin.mjs halter@example.com --revoke
```

### Weitere Scripts

```bash
pnpm lint          # Biome-Linter
pnpm check         # Linter + Formatprüfung
pnpm format        # Automatisch formatieren
pnpm typecheck     # TypeScript ohne Emit
pnpm build         # Produktionsbuild
pnpm db:migrate    # Migrationen einspielen
```

## Produktion

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile proxy up -d --build
```

Das startet den Standalone-Build der App hinter Caddy, das über `DOMAIN` automatisch ein TLS-Zertifikat besorgt. Die Datenbank ist dabei nur im Compose-Netz erreichbar, nicht von außen. Ohne `--profile proxy` läuft die App ohne Proxy; dann muss in `docker-compose.prod.yml` ein Port-Mapping für `web` ergänzt werden.

**Vor dem ersten Produktionsstart:**

- `BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` und `RATE_LIMIT_SALT` durch echte Zufallswerte ersetzen (`openssl rand -base64 32`).
- `BETTER_AUTH_URL` und `DOMAIN` auf die echte Domain setzen.
- `SMTP_*` auf ein echtes Mail-Relay zeigen lassen. Die Voreinstellung `mailpit` existiert nur im Entwicklungs-Setup — ohne funktionierenden Mailversand kann sich niemand registrieren.
- Das Volume `pgdata` in die Backup-Routine aufnehmen; `proofs` enthält personenbezogene Bilder.

### Environment-Variablen

Siehe `.env.example` für die vollständige Liste mit Erläuterungen.

| Variable                                   | Zweck                                                     |
| ------------------------------------------ | --------------------------------------------------------- |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Datenbank-Container und Owner-Rolle             |
| `APP_DB_PASSWORD`                          | Passwort der App-Rolle `platedrop_app`                     |
| `DATABASE_URL`                             | Verbindung der App (App-Rolle, RLS greift)                 |
| `DATABASE_ADMIN_URL`                       | Verbindung für Migrationen und Wartung (Owner-Rolle)       |
| `BETTER_AUTH_SECRET`                       | Signaturschlüssel für Sessions und Token                   |
| `BETTER_AUTH_URL`                          | Öffentliche Basis-URL, Grundlage der Links in E-Mails      |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | Mailversand |
| `PROOFS_DIR`                               | Verzeichnis der Beweisfotos                                |
| `RATE_LIMIT_SALT`                          | Geheimes Salt zum Hashen der Client-IPs                    |
| `DOMAIN`                                   | Domain für den Caddy-Proxy und dessen TLS-Zertifikat       |

## Tests

```bash
pnpm test              # Unit-Tests, ohne Docker
pnpm test:db:up        # Wegwerf-Postgres und Mailpit für Integrationstests
pnpm test:integration  # Integrationstests gegen echtes Postgres
pnpm test:db:down      # Testcontainer wieder abräumen
pnpm smoke             # End-to-End gegen den laufenden Stack (docker compose up)
```

**Unit-Tests** (`pnpm test`)

- `__tests__/utils/plateUtils.test.ts`: Normalisierung und Validierung von Kennzeichen
- `__tests__/components/ClaimPlateForm.test.tsx`: Claim-Formular und Validierung
- `__tests__/lib/proofs.test.ts`: Ablage der Beweisfotos, insbesondere der Schutz gegen Pfad-Ausbrüche

**Integrationstests** (`pnpm test:integration`, benötigt Docker)

- `rls.test.ts`: Die Policies selbst — anonym schreiben aber nicht lesen, keine fremden Nachrichten, kein Selbst-Freischalten, kein Admin-Zugriff ohne Admin-Recht. Der wichtigste Testblock des Projekts.
- `queries.test.ts`: Alle Funktionen des Data-Access-Moduls gegen echte Policies
- `dbContext.test.ts`: Transaktionskontext, Rollback und dass die Nutzer-ID nicht auf der Verbindung zurückbleibt
- `dropMessage.test.ts`: Die öffentliche Server Action samt beider Rate-Limits
- `migrate.test.ts`, `setAdmin.test.ts`, `mailer.test.ts`: Migrations-Runner, Admin-Skript, Mailversand

**Rauchtest** (`pnpm smoke`) prüft gegen den laufenden Stack den vollständigen Ablauf über HTTP: Registrierung, Bestätigungsmail, Login, geschützte Seiten, Auslieferung der Beweisfotos für Halter/Fremde/Abgemeldete und den Passwort-Reset.

## Projektstruktur

```
db/migrations/          Schema, Policies und Rate-Limits als nummerierte SQL-Dateien
scripts/                Migrations-Runner, Admin-Skript, Rauchtest, Auth-Schema-Generator
src/lib/db/             Verbindungspool, Transaktionskontext und alle SQL-Zugriffe
src/lib/auth/           better-auth-Konfiguration und Session-Helfer
src/lib/email/          Mailversand und Vorlagen
src/lib/storage/        Ablage und Auslieferung der Beweisfotos
src/lib/utils/          Kennzeichenlogik und pseudonymisiertes IP-Hashing
src/app/**/actions.ts   Server Actions — der einzige Weg für Mutationen
```

Wichtige Einzeldateien:

- `src/lib/db/context.ts`: Setzt den Nutzerkontext für die RLS-Policies
- `src/lib/db/queries.ts`: Sämtliche SQL-Zugriffe der Anwendung
- `src/app/api/proofs/[...path]/route.ts`: Ausliefern der Beweisfotos mit Prüfung pro Abruf
- `db/migrations/0004_policies.sql`: Das Sicherheitsmodell in SQL
