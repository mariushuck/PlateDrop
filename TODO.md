# TODO

Was als Nächstes ansteht, nach Priorität. Stand: 2026-10-13 (Branch `dev`).
Herkunft der Punkte: offene Reste aus [AUDIT.md](AUDIT.md), ein Abgleich von Code und Doku,
Repo-Audits vom 2026-10-12 und 2026-10-13, die Produktstrategie in [docs/strategy.md](docs/strategy.md)
und der Markteintrittsplan in [docs/go-to-market.md](docs/go-to-market.md).

Erledigtes hier abhaken und bei Gelegenheit entfernen. Was sich am Verhalten ändert, gehört
zusätzlich in [docs/architecture.md](docs/architecture.md) bzw. [docs/admin.md](docs/admin.md).

## Richtung

PlateDrop geht in Richtung **Nische / B2B**, nicht in den Massenmarkt: **ein universelles Produkt für
Privatgelände** (Firmenparkplätze, Wohnanlagen über Hausverwaltungen, private Parkflächen), kein
Sonderbau je Segment (Entscheidung 2026-10-13). Im Privatmarkt bleibt die App kostenlos. Begründung
und Geschäftsmodell stehen in [docs/strategy.md](docs/strategy.md), Segmente, Vertrieb, Pilot und die
nicht-technischen Schritte (Gespräche als Go/No-Go, AV-Verträge, Arbeitgeberklärung) in
[docs/go-to-market.md](docs/go-to-market.md). Hier stehen nur die technischen Pakete (P3). P0 bleibt
Voraussetzung für jeden öffentlichen Start.

---

## P0 — vor dem Go-Live

- [ ] **Impressum mit echten Daten füllen** (Audit C1). Alle mit „Platzhalter" markierten Werte in
  `src/app/impressum/page.tsx` ersetzen (`TODO(go-live)` im Kopfkommentar), danach juristisch prüfen
  lassen.
- [ ] **Betreiber-Platzhalter in der Datenschutzerklärung füllen** (Audit C2): Verantwortlicher,
  Hosting, zuständige Aufsichtsbehörde in `src/app/datenschutz/page.tsx`. Falls
  `MESSAGE_RETENTION_DAYS` gesetzt wird, die Frist dort als Speicherdauer nennen.
- [ ] **AV-Verträge** mit SMTP-Anbieter und Hosting-Provider schließen.
- [ ] **Kontaktadresse für Datenschutzanfragen** auf einer eigenen Domain einrichten und in
  `src/app/datenschutz/page.tsx` eintragen (heute Platzhalter; das frühere `privacy@platedrop.de`
  gehört einer fremden, aktiv registrierten Domain).
- [ ] **Produktions-`.env`**: alle Secrets frisch mit `openssl rand -base64 32`,
  `BETTER_AUTH_URL=https://<domain>`, `TRUSTED_PROXY_HOPS` passend zum tatsächlichen Proxy-Setup
  (admin.md B1/B2).
- [ ] **Cron-Jobs einrichten** für `scripts/maintenance.mjs` (täglich) und den `backup`-Service
  (täglich), siehe admin.md B9.
- [ ] **Backups außer Haus und verschlüsselt** ablegen; das Volume `backups` liegt auf demselben
  Server wie die Daten. Einen Restore einmal vollständig durchspielen (admin.md B5).
- [x] **Integrationstests grün bestätigen**: CI-Job `integration` grün (Lauf 37219861770,
  2026-10-04).
- [x] **`dev` nach `main` mergen**: per Pull Request am 2026-10-04 (39 Commits, CI grün).

## P1 — Absicherung und Tests

- [ ] **Merge-Commit `acd2971` (PR #12) trägt noch die Gmail-Adresse.** Er entstand, bevor die
  E-Mail-Privatsphäre auf GitHub aktiv war; ein Ersatz mit gleichem Inhalt und noreply-Autor ist
  vorbereitet, der Force-Push kam aber nicht an. Da `main` geschützt ist (auch für Admins), geht
  das nur so:
  1. Branch-Schutz von `main` kurz lockern (`enforce_admins` aus, Force-Push erlauben).
  2. Ersatz-Commit bauen: gleicher Baum, gleiche Eltern (`2611c37`, `46ed19a`), gleiche Message und
     Zeitstempel, Autor `186077186+mariushuck@users.noreply.github.com`
     (`git commit-tree acd2971^{tree} -p acd2971^1 -p acd2971^2` mit `GIT_AUTHOR_*`).
  3. Alles, was seitdem auf `main` liegt (ab `6b55e86`, PR #13), per `git rebase --rebase-merges`
     auf den Ersatz setzen; die Hashes ändern sich ab dort.
  4. `main` und `dev` mit `--force-with-lease` pushen, Schutz exakt wiederherstellen und per
     `gh api …/branches/main/protection` prüfen.
  5. Kontrolle: `git log origin/main --format=%ae | sort -u` zeigt nur noreply-Adressen.
  Claude Code hat diese Abfolge blockiert; ausführen oder per Berechtigungsregel freigeben.
- [ ] **E-Mail-Adresse in alten Git-Objekten**: Die Historie ist auf die noreply-Adresse
  umgeschrieben (2026-10-04), die E-Mail-Privatsphäre auf GitHub ist aktiv und die globale
  Git-Adresse umgestellt. Alte Commits bleiben aber über die PR-Seiten #1–#12 erreichbar; optional
  den GitHub Support bitten, Cached Views und PR-Refs zu entfernen („Removing sensitive data from a
  repository"). Andere lokale Klone neu klonen.

- [ ] **Neue Befehle in admin.md gegen den laufenden Stack prüfen**: Restore aus
  `platedrop_backups` (B5), `jq`-Filter für JSON-Logs und Health-Abfrage (B7). Danach die
  Einschränkung im Intro von admin.md entfernen.
- [ ] **Standalone-Output enthält das ganze Projekt, inklusive `.env`.** Der dynamische
  Dateizugriff in `src/lib/storage/proofs.ts` (`resolve(join(root, objectPath))`, Zeile 70 u. a.)
  lässt den Next-Build alles in `.next/standalone` aufnehmen; seit Next 16.3 gibt es dazu eine
  Build-Warnung. Im Docker-Image harmlos, weil `.dockerignore` `.env*` ausschließt. Bei einem
  Deployment von `.next/standalone` ohne Docker würden aber die Secrets mitgeliefert. Abhilfe:
  `/*turbopackIgnore: true*/` an den Pfadaufrufen, danach prüfen, dass `.next/standalone` kein
  `.env`/`src` mehr enthält.
- [ ] **Smoke-Test erweitern** (`scripts/smoke-test.mjs`): `/api/health`, Security-Header (CSP,
  `X-Frame-Options`, kein `X-Powered-By`), Datenexport, Kontolöschung inklusive Entfernen des
  Foto-Verzeichnisses.
- [ ] **Rate-Limit für Foto-Uploads** je Nutzer. Claims sind seit `0011` auf drei offene begrenzt;
  Uploads bremst weiterhin nichts (Audit W1 nannte das fehlende Lockout).
- [ ] **Optional `FORCE ROW LEVEL SECURITY`** auf `verified_plates` und `messages` (Audit-Empfehlung
  zu W2, nicht umgesetzt). Nur mit neuer Migration und RLS-Suite.
- [ ] **Skripte laden keine `.env`-Datei.** Lokal ohne Docker brauchen `pnpm db:migrate`,
  `db:set-admin` und `db:prune` die Variablen aus der Umgebung (README nennt
  `node --env-file=.env.local …`). Bequemer wäre z. B. ein Script-Eintrag mit `--env-file-if-exists`.
- [ ] **`prune-proofs.mjs` kann frische Uploads löschen.** Es liest erst die referenzierten Pfade, dann
  die Dateien; ein Upload dazwischen (Datei geschrieben, `setProofPath` noch nicht committet) gilt als
  verwaist. Dateien jünger als eine Stunde überspringen (`mtimeMs`, `stat` läuft dort schon).
- [ ] **Ein Absender kann ein Kennzeichen eine Stunde stummschalten.** Bei 10/Minute je Absender
  erreicht eine einzige IP den Deckel von 20/Stunde je Kennzeichen in zwei Minuten; danach bekommt
  jeder andere „Zu viele Anfragen“. Neue Migration: zweites Limit je Absender *und* Kennzeichen
  (z. B. 3/Stunde, Schlüssel IP-Hash + Kennzeichen), `check_message_rate` mit Limit als Parameter.
  RLS-/Query-Tests mitziehen.
- [ ] **Dashboard lädt alle Nachrichten ohne Obergrenze.** `listMessagesForUser` hat kein `LIMIT`;
  ohne `MESSAGE_RETENTION_DAYS` wächst die Seite unbegrenzt (Spam am Limit ≈ 14.000/Monat). `LIMIT 200`
  plus Hinweis auf den Datenexport; `exportUserData` bleibt vollständig.
- [ ] **HEIC-Beweisfotos sind in Chrome/Firefox nicht sichtbar.** Der Admin sieht ein kaputtes Bild
  und kann nur ablehnen. HEIC aus `ALLOWED_TYPES` und `sniffImageType` streichen, damit der Nutzer
  sofort eine klare Meldung bekommt (vorher prüfen, ob iPhones beim Upload ohnehin JPEG liefern).
- [ ] **CI nach dem Runner-Wechsel prüfen**: `ubuntu-latest` wird ab 2026-10-19 Ubuntu 26
  (Hinweis in den Run-Annotations). Ersten Lauf danach kontrollieren, bei Problemen `ubuntu-24.04`
  pinnen.

## P2 — Verbesserungen

- [ ] **Fehler-Aggregation** (Sentry oder self-hosted GlitchTip) an `src/lib/logger.ts` andocken
  (Audit W10, offen). Neuer Empfänger → Datenschutzerklärung und ggf. AV-Vertrag.
- [ ] **CSP mit Nonce** statt `'unsafe-inline'` für Skripte (`next.config.ts`). Braucht eine
  Request-Schicht, in der pro Anfrage ein Nonce entsteht.
- [ ] **Begründung bei Ablehnungen**: Admins können heute keinen Grund angeben, Halter sehen nur
  einen Standardtext (admin.md A3).
- [ ] **Optional Breached-Password-Check** bei Registrierung und Passwortwechsel (Audit W14).
- [ ] **Gleiche Datei nach Fehler nicht erneut wählbar** (`ProofUploadForm.tsx`): `input.value`
  wird nach einem Fehler nicht zurückgesetzt, deshalb feuert `onChange` bei derselben Datei nicht.
- [ ] **Unbehandelte Fehler statt Validierungsmeldung.** `formData.get(...) as string` in
  `dropMessage`, `claimPlate` und den Auth-/Settings-Actions wirft bei einem Datei-Wert (`.trim`
  fehlt) einen 500er. `uploadProof` mit einer `plateId`, die keine UUID ist, wirft 22P02 außerhalb
  des `try` (`plateBelongsToUser`). Typ bzw. UUID-Format vorab prüfen.
- [ ] **`x-real-ip`-Fallback streichen** (`src/lib/utils/rateLimit.ts`): Hinter Caddy ist er tot,
  weil Caddy immer `X-Forwarded-For` setzt; bei falsch gesetztem `TRUSTED_PROXY_HOPS` ohne Proxy ist
  der Header frei fälschbar (Rest von Audit W8).
- [ ] **Build loggt „Could not validate the database schema“** (seit better-auth 1.7.7): `next build`
  ohne erreichbare DB prüft better-auth das Schema und meldet einen Fehler, der Build läuft aber
  durch. Prüfen, ob sich die Validierung beim Build abschalten lässt, damit echte Fehler im Log
  auffallen.
- [ ] **Verwaistes Foto bei DB-Fehler in `uploadProof`**: wirft `setProofPath`, bleibt die Datei bis
  zum nächsten Prune liegen. Im `catch` `deleteProof(objectPath)` aufrufen wie im `!updated`-Zweig.
- [ ] **Toter Code in `deleteAccount`**: `deleted` ist nach dem `try` immer `true`, `return { error:
  null }` unerreichbar. Variable streichen, direkt `redirect("/")`.
- [ ] **`normalizePlate` und `validateGermanPlate`** nutzt nur der Test; die App verwendet überall
  `parsePlate`. Beide samt Testblöcken löschen.
- [ ] **`EXTENSION_TO_TYPE`** in `src/lib/storage/proofs.ts` ist die Umkehrung von `ALLOWED_TYPES`;
  per `Object.fromEntries` ableiten.

## P3 — Produkt (Strategie, nach P0)

Reihenfolge A → B → E, private Sticker zuletzt ([strategy.md §5](docs/strategy.md#5-empfohlene-reihenfolge)).
Jede Phase: Migration mit RLS-Suite, Datenschutzerklärung und `docs/architecture.md` im selben Zug
nachziehen.

### Phase A — Fundament: erledigt (2026-10-13)

Migrationen `0011` (Claim-Konkurrenz) und `0012` (Ausblenden, Melden, Pausieren); Details in
[docs/architecture.md](docs/architecture.md). Offen ist nur die Oberfläche fürs Pausieren: Sie kommt
mit den Benachrichtigungen in Phase B, weil die Pause nur dort wirkt.

### Phase B — Nachrichtentypen und Benachrichtigung: E-Mail erledigt (2026-10-13)

Migration `0013`, Katalog, Formular, Dashboard, Outbox, Notifier, Einstellungen, Ruhezeiten,
Bündeln, Pausieren und Monitoring in `/api/health` sind gebaut ([architecture.md](docs/architecture.md)).
Offen ist nur Web Push, bewusst später:

- [ ] **Web Push**: Tabelle `push_subscriptions`, `public/sw.js`, `src/app/manifest.ts`, Paket
  `web-push`, VAPID-Variablen in `.env.example` und Compose, CSP um `worker-src 'self'`; Notifier
  schickt zusätzlich Push und löscht Endpunkte bei 404/410; Push-Freigabe unter
  `/dashboard/settings`; Datenschutzerklärung (Push-Dienste der Browserhersteller, Speicherdauer
  der Abos). Auf iPhones nur als Home-Bildschirm-App – Onboarding muss das erklären.

### Phase E — Mandanten für Privatgelände: erledigt (2026-10-13)

Migration `0014`, `/s/[token]`, `/o/[slug]/admin` mit Aushang-Druckseite, Beitritt per QR mit
Freigabe, Standort-Scope, Fuhrparkliste, Offboarding, Statistik, Einstellungen, `/betreiber`,
`scripts/create-org.mjs` und `delete-org.mjs`; Testgruppe „Mandantentrennung“ in `rls.test.ts`.
Details in [architecture.md](docs/architecture.md#organisationen-0014) und
[admin.md, Teil C](docs/admin.md#teil-c--organisationen). Offen:

- [ ] **Vor dem ersten zahlenden Kunden**: Fehler-Aggregation aus P2 und Uptime-Monitoring auf
  `/api/health` (inklusive `outboxLagSeconds`); Penetrationstest der Mandantentrennung vor dem
  zweiten Kunden (strategy.md §3.7).
- [ ] **Kontaktadresse auf `/betreiber`** eintragen (`CONTACT_EMAIL`, `TODO(go-live)`), zusammen mit
  der Datenschutz-Kontaktadresse aus P0.
- [ ] **Optional, wenn Piloten es verlangen:** Einladung per Mail zusätzlich zum Beitritt über den
  Aushang; eigene Katalog-Einträge je Organisation; Import der Fuhrparkliste als CSV statt
  einzeln.

### Später — private QR-Sticker ([strategy.md §1](docs/strategy.md#1-hebel-1--opt-in-per-qr-sticker))

- [ ] `contact_tags`, `messages.tag_id`/`status_token`, `messages_exactly_one_target`; zweite
  SELECT-Policy für Tag-Nachrichten.
- [ ] Öffentliches Formular `/t/[token]` mit `dropTagMessage` (gleiche Rate-Limits),
  Statusseite `/status/[statusToken]` über `SECURITY DEFINER`-Funktion ohne Inhalt (`/s/` gehört
  seit `0014` dem Standort-Formular).
- [ ] `/dashboard/tags` (anlegen, umbenennen, widerrufen) und Sticker-PDF als GET-Route; als
  vierte Route-Ausnahme in `CLAUDE.md` dokumentieren.
- [ ] Integrationstests (fremder Nutzer, widerrufener Tag, Statusfunktion) und Smoke-Test
  Scan → Nachricht → Dashboard.
