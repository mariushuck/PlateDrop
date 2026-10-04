# PlateDrop

PlateDrop ist eine privacy-first Web-App für deutsche Kennzeichen. Nachrichten können anonym an ein
Kennzeichen gesendet werden. Lesen dürfen sie nur angemeldete Nutzer, die das jeweilige Kennzeichen
verifiziert haben.

Die Anwendung läuft vollständig selbst betrieben — eigener Postgres, eigene Auth, eigener
Dateispeicher, eigener Mailversand, je ein Container und ein optionaler Reverse Proxy.

## Kernidee

PlateDrop trennt Schreiben und Lesen bewusst voneinander:

1. Öffentlich kann jede Person eine Nachricht an ein Kennzeichen senden, ohne Konto und ohne Login.
2. Beim Speichern wird das Kennzeichen normalisiert, damit Leerzeichen, Bindestriche und
   Kleinbuchstaben konsistent verarbeitet werden.
3. Lesen ist nur nach Anmeldung und Kennzeichen-Verifizierung möglich.
4. Ein Admin prüft die Verifizierungen und gibt sie frei oder lehnt sie ab.

Diese Asymmetrie ist die zentrale Entwurfsvorgabe. Wie sie durchgesetzt wird, steht in der
[technischen Dokumentation](docs/architecture.md#5-sicherheitsmodell).

## Tech Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL 18 über `pg` ·
better-auth · nodemailer · Docker Compose · Jest · Biome

## Schnellstart

```bash
cp .env.example .env      # Passwörter und Secrets eintragen
docker compose up -d
```

- App: <http://localhost:3000>
- Postfach (Mailpit): <http://localhost:8025> — hier landen in der Entwicklung alle E-Mails
- Postgres: `localhost:5432`

Die Migrationen spielt der One-shot-Service `migrate` vor dem Start der App ein.

**Nach einer Änderung an den Abhängigkeiten** (`package.json`, `pnpm-lock.yaml`) mit
`docker compose up -d --build --renew-anon-volumes` starten. Der Dev-Container hält `node_modules`
in einem anonymen Volume, das ein normaler Neubau behält. `pnpm dev` würde dann die veralteten
Pakete bemerken, neu installieren wollen und ohne Terminal mit
`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` in einer Neustartschleife hängen.

**Erstes Admin-Konto anlegen:** registrieren, Bestätigungsmail in Mailpit öffnen, dann

```bash
docker compose run --rm migrate node scripts/set-admin.mjs deine@mail.de
```

Ausführlich in der [Admin-Anleitung](docs/admin.md#a1-das-erste-admin-konto-anlegen).

### Ohne Docker entwickeln

```bash
docker compose up -d db mailpit
# In .env.local `db`/`mailpit` durch `localhost` ersetzen und PROOFS_DIR auf ./.data/proofs setzen
pnpm install
node --env-file=.env.local scripts/migrate.mjs
pnpm dev
```

`pnpm dev` liest `.env.local` selbst, die Skripte unter `scripts/` dagegen nicht — sie brauchen die
Variablen aus der Umgebung, daher `node --env-file=…`. Das gilt auch für `pnpm db:migrate`,
`db:set-admin` und `db:prune`.

## Dokumentation

| Dokument | Inhalt |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Aufbau, Datenmodell, Sicherheitsmodell, Abläufe, Teststrategie |
| [docs/admin.md](docs/admin.md) | Admin-Aufgaben und Serverbetrieb: Admin anlegen, Freigaben, Backup, Wartung, Updates, Störungssuche |
| [.env.example](.env.example) | Alle Umgebungsvariablen, kommentiert |
| [AUDIT.md](AUDIT.md) | Sicherheits- und Compliance-Audit vor dem Go-Live, mit Umsetzungsstand je Finding |
| [TODO.md](TODO.md) | Was als Nächstes ansteht, priorisiert |

## Tests

```bash
pnpm test              # Unit-Tests, ohne Docker
pnpm test:db:up        # Wegwerf-Postgres und Mailpit für die Integrationstests
pnpm test:integration  # Integrationstests gegen echtes Postgres
pnpm test:db:down      # Testcontainer abräumen
pnpm smoke             # End-to-End gegen den laufenden Stack
```

Der wichtigste Testblock ist `__tests__/integration/rls.test.ts` — er sichert die Zusage ab, dass nur
verifizierte Halter ihre Nachrichten lesen können. Details zur
[Teststrategie](docs/architecture.md#9-teststrategie).

Die CI (`.github/workflows/ci.yml`) führt Lint, Typecheck, Unit- und Integrationstests, Build,
`pnpm audit` und einen Secret-Scan bei jedem Push auf `main`/`dev` und jedem Pull Request aus.

## Weitere Befehle

```bash
pnpm lint          # Biome-Linter
pnpm check         # Linter + Formatprüfung
pnpm format        # Automatisch formatieren
pnpm typecheck     # TypeScript ohne Emit
pnpm build         # Produktionsbuild
pnpm db:migrate    # Migrationen einspielen
pnpm db:set-admin  # Admin-Rechte vergeben: pnpm db:set-admin <mail> [--revoke]
pnpm db:prune      # Datenpflege: Sitzungen, Rate-Limit-Zeilen, alte Nachrichten, verwaiste Fotos
```

Die drei `db:`-Befehle erwarten `DATABASE_ADMIN_URL` (und für `db:migrate` `APP_DB_PASSWORD`) in
der Umgebung. Im Docker-Betrieb laufen sie stattdessen über
`docker compose run --rm migrate node scripts/…`.

## Produktion

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile proxy up -d --build
```

Startet den Standalone-Build hinter Caddy mit automatischem TLS; die Datenbank bleibt dabei im
internen Netz. Was vorher zu konfigurieren ist — Secrets, Domain, SMTP — steht in
[docs/admin.md, Teil B](docs/admin.md#teil-b--serverbetrieb).
