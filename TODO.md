# TODO

Was als Nächstes ansteht, nach Priorität. Stand: 2026-10-12 (Branch `dev`).
Herkunft der Punkte: offene Reste aus [AUDIT.md](AUDIT.md), ein Abgleich von Code und Doku, ein
Repo-Audit vom 2026-10-12 und die Produktstrategie in [docs/strategy.md](docs/strategy.md).

Erledigtes hier abhaken und bei Gelegenheit entfernen. Was sich am Verhalten ändert, gehört
zusätzlich in [docs/architecture.md](docs/architecture.md) bzw. [docs/admin.md](docs/admin.md).

## Richtung

PlateDrop geht in Richtung **Nische / B2B** (Einstieg Firmenparkplätze, danach Wohnanlagen), nicht
in den Massenmarkt. Im Privatmarkt ist die Monetarisierbarkeit begrenzt; dort bleibt die App
kostenlos. Begründung, Geschäftsmodell und die nicht-technischen Schritte (Nutzertests, Gespräche
mit Facility-Managern als Go/No-Go, AV-Verträge, Arbeitgeberklärung) stehen in
[docs/strategy.md](docs/strategy.md). Hier stehen nur die technischen Pakete (P3). P0 bleibt
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
- [ ] **Bug: Retention-Variablen erreichen den `migrate`-Container nicht.** `docker-compose.yml`
  reicht `MESSAGE_RETENTION_DAYS` und `THROTTLE_RETAIN_DAYS` nicht durch; per Cron über
  `docker compose run --rm migrate node scripts/maintenance.mjs` gesetzte Fristen werden still
  ignoriert. Beide in `services.migrate.environment` ergänzen, danach den Hinweis „Bekannte Lücke"
  in admin.md B9 entfernen.
- [ ] **Bug: Beweisfotos über 1 MB scheitern.** Next.js nimmt Server-Action-Requests standardmäßig nur
  bis 1 MB an; `uploadProof` erlaubt 5 MB, Caddy 8 MB. Ein normales Handyfoto bricht mit „Ein Fehler
  ist aufgetreten“ ab. In `next.config.ts` `experimental.serverActions.bodySizeLimit: "6mb"` setzen
  (gilt auch für `dropMessage`; Caddy deckelt bei 8 MB).
- [ ] **Bug: `scripts/backup.sh` meldet Erfolg trotz gescheitertem `pg_dump`.** `set -eu` prüft in
  `pg_dump | gzip` nur `gzip`; es entsteht eine leere Sicherung, und nach `BACKUP_RETENTION_DAYS`
  sind alle guten Sicherungen weggeräumt. `set -euo pipefail` (Busybox-ash kann das).
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
- [ ] **Rate-Limit für Claim und Foto-Upload** je Nutzer. Heute bremst nichts das massenhafte
  Beanspruchen von Kennzeichen oder Hochladen (Audit W1 nannte das fehlende Lockout). Zusammen mit
  „höchstens 3 offene Claims“ aus P3 Phase A umsetzen.
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
- [ ] **Alte E-Mail-Adresse bleibt in `users.name`.** `signUp` setzt `name: email`; nach einer
  E-Mail-Änderung steht die alte Adresse dort für immer und fehlt im Datenexport. `name: ""` bei der
  Registrierung plus Migration, die bestehende Werte leert; admin.md-Datenliste anpassen.
- [ ] **HEIC-Beweisfotos sind in Chrome/Firefox nicht sichtbar.** Der Admin sieht ein kaputtes Bild
  und kann nur ablehnen. HEIC aus `ALLOWED_TYPES` und `sniffImageType` streichen, damit der Nutzer
  sofort eine klare Meldung bekommt (vorher prüfen, ob iPhones beim Upload ohnehin JPEG liefern).
- [ ] **Upload-Weg ungetestet.** Der Smoke-Test schreibt das Foto direkt ins Volume und setzt den Pfad
  per SQL, deshalb fiel das 1-MB-Limit nicht auf. Ein ~2 MB großes JPEG über die echte Action
  hochladen und danach `pending` prüfen.

## P2 — Verbesserungen

- [ ] **Fehler-Aggregation** (Sentry oder self-hosted GlitchTip) an `src/lib/logger.ts` andocken
  (Audit W10, offen). Neuer Empfänger → Datenschutzerklärung und ggf. AV-Vertrag.
- [ ] **CSP mit Nonce** statt `'unsafe-inline'` für Skripte (`next.config.ts`). Braucht eine
  Request-Schicht, in der pro Anfrage ein Nonce entsteht.
- [ ] **Begründung bei Ablehnungen**: Admins können heute keinen Grund angeben, Halter sehen nur
  einen Standardtext (admin.md A3).
- [ ] **Optional Breached-Password-Check** bei Registrierung und Passwortwechsel (Audit W14).
- [ ] **Aufräumen**: Next-Boilerplate `public/{file,globe,next,vercel,window}.svg` wird nirgends
  verwendet und kann weg.
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

### Phase A — Fundament ([strategy.md §0](docs/strategy.md#0-fundament-zwei-lücken-die-jeder-hebel-voraussetzt))

- [ ] **Migration `0010` Claim-Konkurrenz**: `verified_plates_plate_unique` durch partielle
  Unique-Indizes ersetzen (ein `approved` je Kennzeichen, ein offener Claim je Nutzer und
  Kennzeichen), Status `expired` und `superseded`. `is_verified` muss bei diesen Übergängen auf
  `false` gehen, sonst liest der abgelöste Halter weiter; am besten per `CHECK` an
  `verification_status` koppeln. `idx_verified_plates_plate` behalten.
- [ ] **`setPlateVerification` löst Konkurrenz auf**: in derselben Transaktion andere `pending` →
  `rejected`, bisheriger `approved` → `superseded`; Mail an den abgelösten Halter.
- [ ] **Höchstens 3 offene Claims je Nutzer** in `claimPlate` (zusammen mit dem P1-Rate-Limit).
- [ ] **`prune-claims` in `scripts/maintenance.mjs`**: offene Claims ohne Foto nach 7 Tagen auf
  `expired`.
- [ ] **RLS-Test Halterwechsel** in `__tests__/integration/rls.test.ts`: alter Halter verliert den
  Zugriff, neuer liest ab 30 Tage vor seinem Claim.
- [ ] **Nachricht ausblenden**: `messages.hidden_at`, `messages_no_update` durch eine Policy nur für
  den verifizierten Halter im Lesefenster ersetzen, Grant nur `UPDATE (hidden_at)`.
- [ ] **Nachricht melden**: Tabelle `message_reports`, Melde-Aktion im Dashboard, Ansicht und
  Erledigen unter `/admin` (DSA-Melde- und Abhilfeverfahren).
- [ ] **Empfang pausieren**: `verified_plates.paused_until`. Nachrichten weiter annehmen (sonst
  verrät die Antwort die Registrierung), aber nicht anzeigen und nicht benachrichtigen.
- [ ] **`MESSAGE_RETENTION_DAYS` verpflichtend**: `requireEnv`, `.env.example`, admin.md B9,
  Speicherdauer in der Datenschutzerklärung (hängt am P0-Bug zu den Retention-Variablen).

### Phase B — Nachrichtentypen und Benachrichtigung ([strategy.md §2](docs/strategy.md#2-hebel-2--vordefinierte-nachrichten-und-benachrichtigung))

- [ ] **Migration `0011`**: `messages.message_type` mit Katalog-`CHECK`, `message_text` nullable,
  `messages_has_content`; Tabellen `push_subscriptions` und `notification_outbox`; `AFTER INSERT`-
  Trigger, der nur für freigegebene, nicht pausierte Halter eine Outbox-Zeile anlegt (gleiche
  Antwortzeit für registrierte und unregistrierte Kennzeichen).
- [ ] **Katalog** in `src/lib/messages/catalog.ts` plus Unit-Test, der Katalog und Migration
  abgleicht.
- [ ] **Formular umstellen**: `src/app/page.tsx` / `dropMessage` nehmen `messageType` statt
  Freitext; kein Freitext mehr für anonyme Absender; Hinweis auf 110/112 bei Notfällen mit Tier oder
  Kind.
- [ ] **Dashboard**: Typ-Text und Symbol, `read_at` beim Öffnen, Ausblenden/Melden aus Phase A.
- [ ] **Notifier-Service**: `scripts/notifier.mjs` als Compose-Service aus dem `runner`-Image;
  `SELECT … FOR UPDATE SKIP LOCKED`, `LISTEN/NOTIFY` plus Polling, Backoff, Push-Endpunkte bei
  404/410 löschen; Test gegen Mailpit.
- [ ] **E-Mail-Vorlage** in `src/lib/email/templates.ts` (nur Typ und Kennzeichen, kein weiterer
  Inhalt).
- [ ] **Web Push**: `public/sw.js`, `src/app/manifest.ts`, Paket `web-push`, VAPID-Variablen in
  `.env.example` und Compose, CSP um `worker-src 'self'`.
- [ ] **Einstellungen** unter `/dashboard/settings`: Kanäle, Ruhezeiten (dringliche Typen
  ignorieren sie), Push-Freigabe; Unit-Test für die Ruhezeiten-Logik.
- [ ] **Bündeln**: höchstens eine Benachrichtigung pro Typ und Viertelstunde.
- [ ] **Monitoring**: Alter des ältesten offenen Outbox-Eintrags in `/api/health`, Log-Warnung ab
  fünf Minuten.
- [ ] **Datenschutzerklärung**: Push-Dienste der Browserhersteller, Speicherdauer der Abos.

### Phase E — Mandanten-MVP ([strategy.md §3](docs/strategy.md#3-hebel-3--b2b-nische-statt-massenmarkt))

Erst bauen, wenn die Gespräche aus strategy.md §3.9 ein Go ergeben haben.

- [ ] **Token- und QR-Technik** (aus Hebel 1, hier zuerst gebraucht): `src/lib/tags/token.ts`
  (`crypto.randomBytes(16)`, base64url), QR serverseitig als SVG, Fehlerkorrektur M/Q.
- [ ] **Migration Organisationen**: `organizations`, `org_members`, `org_sites`; `org_id` auf
  `verified_plates` und `messages`, `messages.sender_id`; Eindeutigkeit des freigegebenen Halters je
  Organisation (`NULLS NOT DISTINCT`).
- [ ] **RLS**: `app.is_org_member()` / `app.is_org_admin()` (`SECURITY DEFINER`); Lese-Policy
  verlangt `m.org_id IS NOT DISTINCT FROM vp.org_id`; Org-Admins geben Kennzeichen frei, lesen aber
  keine fremden Nachrichten.
- [ ] **Eigene RLS-Testgruppe Mandantentrennung**: öffentliche Nachricht erreicht nie das
  Firmenkonto mit demselben Kennzeichen und umgekehrt; Org-Admin liest nichts Fremdes.
- [ ] **Routen**: `/o/[slug]` (Mitglieder), `/o/[slug]/admin` (Mitglieder, Kennzeichen,
  Standorte, Einstellungen), `/o/[slug]/s/[siteToken]` (Besucher-Formular am Standort),
  `/invite/[token]` (Einladung per Mail).
- [ ] **Org-Einstellungen**: Absendername sichtbar oder nicht, Freitext für angemeldete Absender,
  eigene Katalog-Einträge.
- [ ] **Kennzeichen-Import** aus Fuhrpark- oder Parkausweisliste, Freigabe durch Org-Admin statt
  Foto.
- [ ] **Aggregierte Statistik** (Vorfälle pro Woche), nie pro Person.
- [ ] **Vor dem ersten zahlenden Kunden**: Fehler-Aggregation aus P2 und Uptime-Monitoring auf
  `/api/health`.

### Später — private QR-Sticker ([strategy.md §1](docs/strategy.md#1-hebel-1--opt-in-per-qr-sticker))

- [ ] `contact_tags`, `messages.tag_id`/`status_token`, `messages_exactly_one_target`; zweite
  SELECT-Policy für Tag-Nachrichten.
- [ ] Öffentliches Formular `/t/[token]` mit `dropTagMessage` (gleiche Rate-Limits),
  Statusseite `/s/[statusToken]` über `SECURITY DEFINER`-Funktion ohne Inhalt.
- [ ] `/dashboard/tags` (anlegen, umbenennen, widerrufen) und Sticker-PDF als GET-Route; als
  vierte Route-Ausnahme in `CLAUDE.md` dokumentieren.
- [ ] Integrationstests (fremder Nutzer, widerrufener Tag, Statusfunktion) und Smoke-Test
  Scan → Nachricht → Dashboard.
