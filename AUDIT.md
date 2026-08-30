# PlateDrop — Sicherheits- & Compliance-Audit vor Go-Live

**Datum:** 2026-08-30 · **Branch:** `dev` · **Methode:** statische Analyse von `src/`,
`db/migrations/`, `scripts/`, Docker-/Next-Konfiguration und der Git-Historie (46 Commits).
Es wurde **kein Code geändert**.

Bewertung je Punkt: ✅ erfüllt · ⚠️ teilweise/unklar · ❌ nicht erfüllt · N/A.

---

## Stand der Umsetzung (2026-08-30)

Alle Findings wurden bearbeitet (Branch `dev`, 15 Commits). Unit-Tests, Typecheck,
Lint und `next build` sind grün. Die Integrationstests (`pnpm test:db:up &&
pnpm test:integration`) brauchen Docker und **müssen noch lokal ausgeführt werden** –
neu bzw. angepasst: `rls.test.ts` (is_admin-Grant), `queries.test.ts`
(Code-Kollision, `exportUserData`, `plateBelongsToUser`), `migrate.test.ts` (0006/0007),
`pruneThrottle.test.ts`, `pruneMessages.test.ts`.

| ID | Thema | Umsetzung | Commit |
|----|-------|-----------|--------|
| C1 | Impressum | ⚠️ Struktur nach § 5 DDG, Werte bleiben laut Vorgabe Platzhalter → vor Go-Live durch echte Daten ersetzen | `0a36904` |
| C2 | Datenschutzerklärung | ✅ an den echten Stack angepasst; Betreiber-Platzhalter (Verantwortlicher, Hosting, Behörde) füllen | `3f56703` |
| C3 / W16 | Security-Header / HSTS | ✅ CSP + Header in `next.config.ts`, HSTS am Caddy | `cbe894d` |
| C4 / W4 | `RATE_LIMIT_SALT` / `BETTER_AUTH_URL` Fail-Fast | ✅ `requireEnv`, Compose-Guard | `15f1c8e` |
| W1 | Verifizierungscode | ✅ `crypto.randomInt`, UNIQUE (Migration 0006), Kollisions-Retry | `93aa4d5` |
| W2 | `users.is_admin`-Grant | ✅ spaltenscharfes UPDATE (Migration 0007) | `c10153b` |
| W3 | Query-Schicht-Redundanz | ✅ `app.is_admin()` in setPlateVerification / canReadProof / listPendingVerifications | `a53ab99` |
| W5 | Cookie-Flags / trustedOrigins | ✅ explizit gesetzt | `2dea7f7` |
| W6 | Löschung / Datenexport | ✅ Self-Service in den Einstellungen + `beforeDelete`-Foto-Cleanup | `8734cc9` |
| W7 | Retention / Automatik | ✅ `prune-throttle`, opt-in `prune-messages`, `maintenance.mjs`, Cron-Doku | `bf3e512` |
| W8 | Rate-Limit-IP | ✅ Trusted-Proxy-Hops statt erstem XFF-Token | `a38086a` |
| W9 | CI / Dependabot / Secret-Scan | ✅ `.github/workflows/ci.yml`, `dependabot.yml` | `b1d0401` |
| W10 | Logging / Health-Check | ✅ `src/lib/logger.ts`, `/api/health`, Compose-Healthcheck. Offen: Fehler-Aggregation (Sentry/GlitchTip) | `7389f32` |
| W11 | Backup-Automatik | ✅ `scripts/backup.sh` + `backup`-Profil in `docker-compose.prod.yml` | `bf3e512` |
| W12 | Proof-Upload | ✅ Ownership-Check vor Schreiben, Magic-Byte-Prüfung | `b8ee4fd` |
| W13 | E-Mail-HTML-Escaping | ✅ `escapeHtml` in den Templates | `f215272` |
| W14 | `minPasswordLength` | ✅ zentral auf 12 (`passwordPolicy.ts`) | `2dea7f7` |
| W15 | `lucide-react@1.16.0` | ✅ verifiziert – echtes Paket (lucide-icons), gültige Integrity, React-19-Peer | — |
| W17 | Doppelter Footer | ✅ in Impressum und Datenschutz entfernt | `0a36904` / `3f56703` |

**Vor Go-Live noch offen (nicht im Code lösbar):**

1. Echte Firmendaten ins Impressum (C1) und die Betreiber-Platzhalter in der
   Datenschutzerklärung (C2) eintragen, danach juristisch prüfen lassen.
2. AV-Verträge mit SMTP-Anbieter und Hosting-Provider schließen.
3. Produktions-`.env` mit echten, zufälligen Secrets füllen; `TRUSTED_PROXY_HOPS`
   an das tatsächliche Proxy-Setup anpassen.
4. Cron-Jobs für `scripts/maintenance.mjs` und `scripts/backup.sh` einrichten
   (siehe `docs/admin.md` B9).
5. Optional: Fehler-Aggregation (Sentry/GlitchTip) an `src/lib/logger.ts` andocken.
6. `pnpm test:db:up && pnpm test:integration` einmal lokal grün laufen lassen.

---

## 1. Executive Summary

Der anwendungssichere Kern von PlateDrop ist solide: Das asymmetrische Privacy-Modell
(öffentlich schreiben, nur verifizierter Halter liest) wird von zwei echten Schichten
getragen – RLS auf einer `NOSUPERUSER`/`NOBYPASSRLS`-Rolle plus zusätzliche
`user_id`-Filter in jeder Query. Alle SQL-Statements sind parametrisiert, es gibt keine
XSS-Sinks, keine SSRF-Fläche, Passwörter laufen über scrypt, und in 46 Commits wurde
nie ein echtes Secret committet. Produktionsreif ist es trotzdem **nicht**: (1) das
gesetzlich vorgeschriebene Impressum und die Datenschutzerklärung sind Platzhalter- bzw.
Falschtext – die Datenschutzerklärung beschreibt weiterhin einen Supabase-Stack, den die
App nicht mehr nutzt, und verspricht Löschfunktionen, die es nicht gibt; (2) die App
sendet null HTTP-Security-Header (kein CSP, HSTS, X-Frame-Options); (3) mehrere
Datenschutz-Zusagen versagen still – `RATE_LIMIT_SALT` fällt auf einen Leerstring
zurück, Login-IPs liegen im Klartext ohne automatische Löschung, und der
Verifizierungscode nutzt `Math.random()`. Keiner der kritischen Punkte ist ein großer
Eingriff; der längste Hebel ist der Rechts-/DSGVO-Text, weil er echte Firmendaten und
juristische Prüfung braucht. Geschätzter Aufwand bis alle Blocker weg sind: **~2–4
fokussierte Tage**.

---

## 2. Kritische Findings (❌ – blockieren Go-Live)

### C1 — Impressum besteht vollständig aus Platzhalterdaten, ohne § 5 DDG
`src/app/impressum/page.tsx:29-64`
Route `/impressum` existiert und ist site-weit über `src/components/ui/Footer.tsx`
(im Root-Layout) verlinkt – aber **jede Pflichtangabe ist Dummy-Text**: „PlateDrop
GmbH“, „Beispielstraße 123 / 12345 Berlin“, „Max Mustermann, Erika Musterfrau“,
USt-ID „DE 123 456 789“. Kein Verweis auf **§ 5 DDG** (früher § 5 TMG) irgendwo im
Repo. Kein Registergericht/HRB, kein inhaltlich Verantwortlicher i.S.d. § 18 Abs. 2
MStV mit Anschrift. In dieser Form abmahnfähig und nicht rechtskonform.

> **Entscheidung des Betreibers:** Die konkreten Firmendaten bleiben vorerst
> Platzhalter (echte Angaben liegen noch nicht vor). Der Code-Fix beschränkt sich auf
> die **Struktur** (§-5-DDG-Überschrift, Labels für Rechtsform/Register/Vertretung,
> `TODO`-Markierung der Platzhalterwerte, doppelter Footer). C1 bleibt trotzdem
> formal ❌ und ist erst mit echten Daten go-live-fähig.

### C2 — Datenschutzerklärung ist faktisch falsch und verspricht nicht existierende Funktionen
`src/app/datenschutz/page.tsx:69, 86-88, 124-131`
Route `/datenschutz` existiert und ist verlinkt, der Inhalt ist aber inhaltlich unbrauchbar:
- Behauptet **„Authentifizierung über Supabase“** und **„PostgreSQL-Datenbank gehostet
  von Supabase“**. Tatsächlich: better-auth gegen self-hosted `pg`-Pool
  (`src/lib/auth/server.ts:17-20`, `src/lib/db/pool.ts`), keine Supabase-Abhängigkeit.
- Verspricht Konto-Selbstlöschung „jederzeit“ (`:124-127`) und automatische
  Nachrichtenlöschung „nach einem bestimmten Zeitraum“ (`:129-131`) – **beides ist
  nicht implementiert** (siehe W6).
- Beschreibt „kryptographische Verifikation“ des Fahrzeugbesitzes; real ist es
  Foto-Upload + manuelle Admin-Freigabe.
- Fehlt: Art.-6-Rechtsgrundlagen, benannter Verantwortlicher/DSB, Auftragsverarbeiter-
  Liste, Speicherfristen, Drittlandübermittlung. „Letzte Aktualisierung: Mai 2026“.

Eine Datenschutzerklärung, die die Verarbeitung falsch darstellt, verletzt Art. 13/14
DSGVO; die Versprechen nicht vorhandener Betroffenenmechanismen sind zusätzlich irreführend.

### C3 — Keine HTTP-Security-Header (app-weit)
`next.config.ts:1-12`, `Caddyfile:1-16`, kein `src/middleware.ts`
`next.config.ts` setzt nur `output: "standalone"`. Kein `headers()`, keine Middleware,
und der Caddy-Reverse-Proxy setzt ebenfalls keine Header. Damit fehlen **CSP,
Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
Permissions-Policy** komplett. Einziger gesetzter Response-Header im ganzen Projekt:
`nosniff` / `no-store` auf `/api/proofs` (`src/app/api/proofs/[...path]/route.ts:52-56`).
Für einen Auth-Dienst mit personenbezogenen Daten und nutzererzeugten Inhalten
(Clickjacking, kein Transport-Hardening) ist das ein Go-Live-Blocker.

### C4 — `RATE_LIMIT_SALT` fällt still auf `""` zurück
`src/lib/utils/rateLimit.ts:28`
`const salt = process.env.RATE_LIMIT_SALT ?? ""`. Es gibt keine Start-Assertion (anders
als `DATABASE_URL` in `pool.ts` oder `BETTER_AUTH_SECRET`). Nur `docker-compose.yml:58`
erzwingt die Variable via `${RATE_LIMIT_SALT:?}` – jedes andere Deployment (`next start`,
k8s, fehlendes Env) läuft mit `salt=""`. Dann ist der „pseudonymisierte“ Wert schlicht
`sha256(ip:"":YYYY-MM-DD)` und über den ~4-Mrd-IPv4-Raum pro Tag rückrechenbar, d.h. die
IP ist de facto wiederherstellbar gespeichert (`message_throttle.ip_hash`,
`db/migrations/0003_app_tables.sql:41-45`). Widerspricht direkt der Zusage „die rohe IP
wird nie gespeichert“ in `rateLimit.ts:19-23` und `datenschutz/page.tsx:53-56`. DSGVO-relevant.

---

## 3. Wichtige Findings (⚠️)

### W1 — Verifizierungscode nutzt `Math.random()`
`src/app/dashboard/actions.ts:20-27`
`generateVerificationCode()` baut den `XX-XXXX`-Code mit
`chars.charAt(Math.floor(Math.random() * chars.length))`. `Math.random()` ist ein
nicht-kryptographischer PRNG (V8 xorshift128+), bei bekanntem Zustand vorhersagbar.
Verschärfend: **kein UNIQUE-Constraint** auf `verified_plates.verification_code`
(`db/migrations/0003_app_tables.sql:16`), **kein Rate-Limit/Lockout** auf Claim oder
Proof-Upload. Der Code ist das einzige Geheimnis, das den Claim an die vom Admin
visuell geprüfte Windschutzscheiben-Challenge bindet. Alphabet enthält `0/O`, `1/I`.
Der Docstring „Generate a random … code“ ist genau die KI-Boilerplate, die sicher
aussieht und einen unsicheren RNG ausliefert.

### W2 — Auth-Tabellen ohne RLS, App-Rolle mit vollem `UPDATE` inkl. `is_admin`
`db/migrations/0002_auth.sql:7-13, 72`
`users`, `sessions`, `accounts`, `verifications` haben bewusst keine RLS (better-auth
legt Nutzer an, bevor ein Kontext existiert). Dieselbe `platedrop_app`-Rolle, die jede
Fachquery ausführt, hält aber `SELECT, INSERT, UPDATE, DELETE` auf allen vier. Die
Garantie „`is_admin` nur per SQL setzbar“ (`src/lib/auth/server.ts:44-52`,
`scripts/set-admin.mjs`) ist damit **nur applikationsseitig** (better-auth `input:false`).
Ein künftiger Query-Bug/Injection in einem `withUser`/`withAnon`-Block liefe mit Rechten
für `UPDATE users SET is_admin = true` und Lesezugriff auf alle Passwort-Hashes und
Session-Tokens. Heute kein Exploit-Pfad (keine Injection gefunden) – Defense-in-Depth-Lücke.
Empfehlung: spaltenscharfe Grants (kein `UPDATE` auf `is_admin`), ggf. `FORCE ROW LEVEL
SECURITY` auf den Fachtabellen.

### W3 — `setPlateVerification` / `canReadProof` / `listPendingVerifications` ohne Query-Schicht-Redundanz
`src/lib/db/queries.ts:180-188, 200-210, 218-232`
Anders als der Rest von `queries.ts` (redundanter `user_id`-Filter, bewusst –
`:75-78`) haben diese drei **keinen** `user_id`/`is_admin`-Filter im SQL. Sie hängen
allein an RLS plus dem `isAdmin`-Check in `src/app/admin/actions.ts:19-27`. Heute
korrekt (RLS `verified_plates_update_admin` + `WITH CHECK (is_admin())` fangen einen
Nicht-Admin mit `rowCount 0` ab), aber ohne zweite Schicht auf Query-Ebene.

### W4 — `BETTER_AUTH_URL` ohne Fail-Fast, Default `http://localhost:3000`
`docker-compose.yml:57`, `src/lib/auth/server.ts:20`
`${BETTER_AUTH_URL:-http://localhost:3000}` – kein `:?`-Guard wie bei den Secrets.
Ist die Variable in Prod nicht gesetzt oder nicht `https://`, degradieren **secure
Cookies** und die **Origin/CSRF-Prüfung** von better-auth still (beide hängen am
`baseURL`).

### W5 — better-auth Cookie-Flags nicht explizit gesetzt
`src/lib/auth/server.ts:69-78`
Kein `advanced.useSecureCookies`, kein `__Host-`/`__Secure-`-Prefix, kein
`sameSite:"strict"`, kein `trustedOrigins`. Verlässt sich auf Defaults (httpOnly,
sameSite=lax, secure nur bei https-baseURL). Sollte explizit gehärtet werden.

### W6 — Kein programmatischer Lösch-/Auskunftsmechanismus (DSGVO Art. 15/17/20)
`src/app/dashboard/settings/*`, `src/lib/db/queries.ts`, `docs/admin.md:405-456`
better-auth `deleteUser` ist nicht aktiviert. Settings bietet nur Passwort-/E-Mail-
Wechsel. Keine `deleteAccount`/`deleteMessage`/Export-Query. Löschung und Auskunft sind
**reine `psql`-Runbooks** in `docs/admin.md`. Legal ist manuelle Erfüllung binnen Monat
zulässig – aber die Datenschutzerklärung verspricht Selbstbedienung (siehe C2), und es
gibt keinen Datenexport für Art. 20.

### W7 — Keine Retention/Automatik: Klartext-Login-IPs bleiben unbegrenzt
`db/migrations/0002_auth.sql:34-35`, `scripts/prune-sessions.mjs`, `scripts/prune-proofs.mjs`
`sessions.ipAddress` speichert die Login-IP im Klartext (einzige persistente Roh-IP,
bestätigt in `docs/admin.md:412`). Bereinigt nur durch **manuell/ungeplant**
aufgerufenes `scripts/prune-sessions.mjs`. `messages` und `message_throttle` haben
**keine** Löschung – `message_throttle`-Zeilen sammeln sich mit toten Tages-Hashes.
Verwaiste Proof-Dateien nach Kontolöschung nur via `prune-proofs.mjs --delete`
(ebenfalls ungeplant). Verstoß gegen Speicherbegrenzung (Art. 5 Abs. 1 lit. e).

### W8 — Per-Sender-Rate-Limit umgehbar; NULL-Hash passiert
`src/lib/utils/rateLimit.ts:9-17`, `db/migrations/0005_rate_limit.sql:61-64`
`getClientIp()` nimmt ungefiltert den ersten `x-forwarded-for`-Token bzw. `x-real-ip`,
ohne Trusted-Proxy-Allowlist. Ein Angreifer sendet pro Request ein zufälliges
`X-Forwarded-For` und landet in einem frischen Throttle-Bucket – Ebene (b) (10/min) ist
damit wirkungslos. Fehlt der Header ganz, gibt `check_message_rate` `RETURN true`
zurück. Harter Stopp bleibt nur der Trigger (a) 20/h je Kennzeichen
(`0005_rate_limit.sql:12-35`), der ist solide und anonym.

### W9 — Kein CI, kein Dependency-/Secret-Scan
`.github/` (nur `copilot-instructions.md`)
Kein `.github/workflows/`. Trotz vorhandener Skripte (`lint`, `check`, `typecheck`,
`test`, `test:integration`, `smoke`) läuft nichts automatisiert. Kein `pnpm audit`,
kein Gitleaks/TruffleHog, kein Dependabot/Renovate, kein CodeQL.

### W10 — Kein Error-Tracking, keine strukturierte Protokollierung, kein Health-Check
gesamter `src/`-Baum, `docker-compose*.yml`
Nur 17 `console.error`-Aufrufe nach stdout. Kein pino/winston, kein Sentry, keine
Log-Level/Request-IDs/Redaction. Kein `/api/health`; der `web`-Compose-Service hat
keinen `healthcheck` (nur `db` via `pg_isready`).

### W11 — Backups nur als Runbook, nicht automatisiert
`docs/admin.md:305-357`, `scripts/`
`pg_dump` + Proofs-Tarball sind dokumentiert (inkl. Hinweis „verschlüsselt lagern“),
aber es gibt kein Backup-Skript und keinen geplanten Job in irgendeiner Compose-Datei.

### W12 — Proof-Datei wird vor dem Ownership-Check geschrieben; Extension aus Client-`file.type`
`src/app/dashboard/actions.ts:82-91`, `src/lib/storage/proofs.ts:86-101`
`saveProof()` schreibt die Datei, danach prüft `setProofPath()` den Besitz; gehört das
`plateId` nicht dem Aufrufer, wird die Datei wieder gelöscht (`:89`). Self-scoped,
5-MB-gedeckelt, Pfad-Traversal ausgeschlossen (strikte Regex + Prefix-Check, getestet in
`smoke-test.mjs:245`) – aber die Reihenfolge ist verkehrt herum, und bei fehlgeschlagenem
`deleteProof` bleibt ein Orphan. Zusätzlich wählt `saveProof` die gespeicherte Endung aus
dem Client-`file.type` ohne Magic-Byte-Prüfung (Auslieferung mit fixem Bild-`Content-Type`
+ `nosniff` + `inline` mildert Stored-XSS; SVG ist ausgeschlossen).

### W13 — HTML-E-Mail-Templates interpolieren ungeescaped
`src/lib/email/templates.ts:13-24, 56-60`
`url`, `heading`/`body` und `${newEmail}` gehen unescaped in rohes HTML. Werte sind
better-auth-format-validiert und getrimmt/lowercased – geringes Risiko, aber prinzipiell
HTML-escapen.

### W14 — `minPasswordLength: 6`
`src/lib/auth/server.ts:24` (+ `auth/actions.ts:21`, `settings/actions.ts:20`,
`reset-password/actions.ts:27`). Zu schwach; ≥10–12 empfohlen, ggf. Breached-Password-Check.

### W15 — `lucide-react@1.16.0` verifizieren
`package.json:25`. Historisch war das Paket lange auf `0.x`; die `1.x`-Linie kurz
gegenläufig prüfen (npm-Registry), dass es die beabsichtigte Version und kein
Fehl-Resolve ist. Alle übrigen Dependencies sind real, kein Typosquat, `pnpm-lock.yaml`
committet, `--frozen-lockfile` im Dockerfile.

### W16 — Caddy terminiert TLS, sendet aber kein HSTS
`Caddyfile`. Kein `Strict-Transport-Security`-`header`-Directive (überlappt mit C3).

### W17 — Doppelter `<footer>` auf `/impressum` und `/datenschutz`
`src/app/impressum/page.tsx:111-136`, `src/app/datenschutz/page.tsx:196-221`
Beide Seiten rendern zusätzlich zum Layout-Footer einen eigenen hartkodierten Footer –
kosmetischer Bug, aber sichtbar.

---

## 4. Erledigt / in Ordnung (✅)

### IT-Sicherheit
- **Secrets (Code + Historie)** ✅ — 46 Commits, nur `.env.example` mit `change-me`-
  Platzhaltern (`d0aa53a`); nie ein echtes `.env` committet oder gelöscht; `.env` auf
  Disk ist gitignored (`.gitignore:35`) und untracked. Keine AWS-Keys, Private Keys,
  GH-Tokens irgendwo. (Klein: Dummy-Literale `scripts/generate-auth-schema.mjs:26`,
  `scripts/smoke-test.mjs:28` – dev/test-only.)
- **Zugriffskontrolle serverseitig** ✅ — alle Server Actions gaten mit
  `requireUser()`/`requireAdmin()` vor DB/FS (`src/app/dashboard/settings/actions.ts:24,50`,
  `src/app/dashboard/actions.ts:46,66`), Admin-Actions prüfen `user.isAdmin`
  (`src/app/admin/actions.ts:19-27`), `/api/proofs` prüft Session + `canReadProof` pro
  Request und gibt 404 statt 403 (`route.ts:19-41`). Einzige ungeschützte Action ist das
  bewusst öffentliche `dropMessage` (`src/app/actions.ts:10`).
- **IDOR** ✅ — request-gelieferte IDs durch `user_id`-Filter + RLS eingegrenzt
  (`queries.ts:79-173`); Cross-User-`plateId` → 0 Zeilen. (Ausnahmen ohne Query-Redundanz:
  siehe W3.)
- **SQL-Injection** ✅ — durchgängig parametrisiert `$1..$n`, keine Konkatenation/
  Interpolation (`queries.ts`, `context.ts:31`); plpgsql-Funktionen mit gebundenen
  Parametern und `SET search_path = public, pg_temp`.
- **XSS** ✅ — kein `dangerouslySetInnerHTML`/`innerHTML`/`eval`; nutzererzeugte Inhalte
  als escapte JSX-Textknoten (`dashboard/page.tsx:182` u.a.). (Ausnahme E-Mail: W13.)
- **SSRF** ✅ — kein `fetch`/`http.request` mit nutzergesteuerter URL im Runtime-Code;
  ausgehend nur SMTP mit Host aus Env (`src/lib/email/mailer.ts:18-38`).
- **Passwort-Hashing** ✅ — better-auth scrypt (`N=16384, r=16, p=1, dkLen=64`),
  16-Byte-Random-Salt (`@better-auth/utils@0.4.2`). Spalte `accounts.password`.
- **RLS-Modell** ✅ — `platedrop_app` ist `NOSUPERUSER NOBYPASSRLS` und Nicht-Owner
  (`scripts/migrate.mjs:25-43`); `withUser`/`withAnon` setzen `app.user_id` transaktions-
  lokal (`set_config(..., true)`, `src/lib/db/context.ts:31`) → kein Identity-Bleed über
  den Pool; `verified_plates`, `messages`, `message_throttle` haben RLS aktiviert mit
  Policies (`0004_policies.sql`, `0005_rate_limit.sql:47-51`).
- **Proof-Pfad-Traversal** ✅ — strikte `OBJECT_PATH_PATTERN`-Regex + redundanter
  `startsWith(root+sep)`-Check (`src/lib/storage/proofs.ts:61-77`), Test in
  `smoke-test.mjs:245`.
- **Mutations-Mechanismus** ✅ — nur Server Actions; exakt zwei Route-Handler, beide
  bewusst; `/api/proofs` GET-only.
- **CSRF** ✅ — Next.js 16 Origin/Host-Enforcement, kein Widening in `next.config.ts`.
- **Dependencies** ✅ — keine halluzinierten/typosquat-Pakete; `pnpm-lock.yaml` committet;
  `next@16.2.6` nicht von CVE-2025-29927 oder bekannten 15.x-Middleware/Cache-Advisories
  betroffen; `better-auth@1.7.2`, `pg@8.23.0`, `nodemailer@9.0.6` – keine bekannte offene
  CVE. (Nachprüfen: W15; kein `pnpm audit` in CI: W9.)
- **Debug/Stacktraces in Prod** ✅ — `NODE_ENV=production` (`Dockerfile:31`,
  `docker-compose.prod.yml:13`); Server Actions liefern generische Fehlermeldungen,
  Details nur `console.error`; `NEXT_TELEMETRY_DISABLED=1` (`Dockerfile:9`); kein
  `err.message` an den Client.
- **Docker** ✅ — Multi-Stage, non-root (`USER nextjs`, uid 1001), `output: standalone`;
  Prod exponiert weder DB- noch App-Port (`docker-compose.prod.yml:7`);
  `.dockerignore` schließt `.env*`, `.git`, `__tests__` aus; `pnpm install --frozen-lockfile`.
- **Per-Kennzeichen-Rate-Limit** ✅ — DB-Trigger 20/h, vollständig anonym, concurrency-safe
  (`db/migrations/0005_rate_limit.sql:12-35`).
- **Message-IP beim Absenden** ✅ — nur der Tages-Hash wird gespeichert, keine Roh-IP
  (`src/app/actions.ts:46` → `message_throttle`) – **sofern** `RATE_LIMIT_SALT` gesetzt
  ist (sonst C4).
- **Kryptografische IDs** ✅ — `randomUUID()` für User-IDs; Session-/Verify-/Reset-Tokens
  von better-auth crypto-random. Kein md5/sha1/`createCipher`/Custom-Crypto.

### Rechtliches (Deutschland)
- **Impressum vorhanden & erreichbar** ✅ (Struktur) / ❌ (Inhalt, → C1) — Route
  `/impressum`, site-weit im Footer verlinkt.
- **AGB/Nutzungsbedingungen** N/A — keine Zahlungen/Verträge (keine Payment-Libs, kein
  Checkout-Flow, grep über `src/`, `db/`, `docs/` ohne Treffer). Optional, nicht Pflicht.

### DSGVO
- **Datenschutzerklärung vorhanden & verlinkt** ✅ (existiert) / ⚠️ (Inhalt falsch, → C2).
- **Cookie-/Tracking-Consent** N/A — nur der essenzielle better-auth-Session-Cookie
  (`nextCookies()`), keine Analytics/Ad/Third-Party-Cookies → kein TTDSG-§-25-Banner
  nötig. Deckt sich mit `datenschutz/page.tsx:105-112`.
- **Externe Datenempfänger** (für den AV-Vertrags-Check) — vollständige Liste:
  1. **SMTP-Relay** (Laufzeit): Provider aus `SMTP_HOST/PORT/USER/PASS`,
     `src/lib/email/mailer.ts:18-42`. Empfänger: nur die eigenen Adressen registrierter
     Nutzer (Verifizierung/Reset/E-Mail-Wechsel). **→ AV-Vertrag nötig.**
  2. **Hosting-Provider** für Server + Docker-Volume `proofs` (Proof-Fotos =
     personenbezogen). **→ AV-Vertrag nötig.**
  3. **Google Fonts** – `next/font/google` (`src/app/layout.tsx:2`) lädt und
     self-hostet die Font-Dateien **zur Build-Zeit**; kein Laufzeit-Request, keine
     Endnutzer-IP an Google. Build-Zeit-Fetch zu `fonts.googleapis.com` existiert.
     (Kein Laufzeit-AV nötig; sauberer wäre, das CSS explizit lokal einzuchecken.)
  4. **Keine** Analytics, **kein** Sentry, **keine** LLM/AI-API, **keine** Maps/Geocoding,
     **kein** Laufzeit-CDN (grep bestätigt).

### Personenbezogene Daten – Inventar
| Speicherort | Daten | Referenz |
|---|---|---|
| `users` | E-Mail; `name` = E-Mail; `emailVerified`; Zeitstempel | `db/migrations/0002_auth.sql:15-26` |
| `accounts.password` | scrypt-Passwort-Hash | `0002_auth.sql:52` |
| `sessions` | **Klartext-Login-IP** + User-Agent + Token + Ablauf | `0002_auth.sql:28-37` |
| `verifications` | E-Mail + Verify-/Reset-/E-Mail-Wechsel-Token | `0002_auth.sql:57-64` |
| `verified_plates` | Kennzeichen, Verifizierungscode, Proof-Foto-Pfad, Status | `db/migrations/0003_app_tables.sql:9-18` |
| `messages` | Ziel-Kennzeichen, Freitext 1–500 Zeichen, Zeitstempel (kein Absender) | `0003_app_tables.sql:27-34` |
| `message_throttle` | gesalzener Tages-SHA-256 der Absender-IP (keine Roh-IP*) | `0003_app_tables.sql:41-45` |
| Dateisystem `PROOFS_DIR` | Proof-Fotos: Kennzeichen **+ Umfeld** (ggf. Ort/Fahrzeug/Passanten) | `src/lib/storage/proofs.ts:86-101`, `docs/admin.md:322` |
\* nur solange `RATE_LIMIT_SALT` gesetzt ist – siehe C4.

- **Lösch-/Aufbewahrungsmechanismus** ⚠️ — nur manuelle `psql`-Runbooks
  (`docs/admin.md:405-456`); keine Retention auf `messages`/`message_throttle`;
  Session- und Proof-Bereinigung nur über **ungeplante** Skripte. Siehe W6, W7.

### EU AI Act
- **Art. 50 Transparenzpflicht (KI-Ausgaben/Chatbot/Voice)** N/A — die App hat
  **keinerlei** KI-Funktion: kein LLM-Call, kein Chatbot, keine synthetischen Medien,
  keine Biometrie/Emotionserkennung (grep über `src/` ohne Treffer, keine AI-Dependency
  in `package.json`). Proof-Fotos werden nur gespeichert und einem menschlichen Admin
  angezeigt – keine automatische Bildanalyse.
- **Kennzeichnung KI-generierter Medien** N/A — es werden keine Bilder/Audio/Video
  generiert.

---

## 5. Fix-Vorschläge & Aufwand

Aufwandsskala: **XS** < 30 min · **S** ~1–2 h · **M** ~½ Tag · **L** 1–2 Tage.

### Kritisch

| ID | Fix | Aufwand |
|----|-----|---------|
| **C1** | *Betreiber-Entscheidung: Werte bleiben vorerst Platzhalter.* Nur Struktur-Fix in `src/app/impressum/page.tsx`: Überschrift „Angaben gemäß § 5 DDG“, Labels/Abschnitte für Rechtsform, Registergericht + HRB-Nummer, Vertretungsberechtigte, inhaltlich Verantwortlicher (§ 18 MStV) — Werte als klar erkennbare `TODO`-Platzhalter. Doppelten `<footer>` entfernen (W17). **S**. Bleibt ❌ bis echte Firmendaten eingetragen + kurz juristisch gesichtet sind. |
| **C2** | `src/app/datenschutz/page.tsx` neu schreiben: tatsächlichen Stack (better-auth, self-hosted Postgres, SMTP-Provider, Google Fonts nur Build-Zeit), Art.-6-Rechtsgrundlagen je Verarbeitung, Speicherfristen, Auftragsverarbeiter-Liste, Verantwortlicher/DSB, Betroffenenrechte inkl. realistischem Weg (Anfrage per E-Mail, keine „jederzeit“-Selbstbedienung solange W6 offen). Doppelten Footer entfernen. **M** (+ juristische Prüfung empfohlen). |
| **C3** | `headers()` in `next.config.ts` ergänzen: `Content-Security-Policy` (Next-tauglich: `script-src 'self'`, ggf. `'unsafe-inline'` für Styles bis Nonce-Setup, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`), `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (Kamera/Mikro/Geo aus). Zusätzlich HSTS-`header` im `Caddyfile` (W16). CSP-Feintuning für Next ist der fummelige Teil. **S**. |
| **C4** | `RATE_LIMIT_SALT` zur harten Startvoraussetzung machen: früh werfen wenn ungesetzt (Muster aus `src/lib/db/pool.ts`), `?? ""` entfernen (`src/lib/utils/rateLimit.ts:28`). Gleiches Fail-Fast für `BETTER_AUTH_URL` (W4) und `:?`-Guard in `docker-compose.yml:57`. **XS**. |

### Wichtig

| ID | Fix | Aufwand |
|----|-----|---------|
| **W1** | `Math.random()` → `crypto.randomInt()` in `generateVerificationCode()`; neue Migration `0006_*` mit `UNIQUE (verification_code)` auf `verified_plates`; eindeutiges Alphabet ohne `0/O/1/I`; Retry bei Kollision. **XS–S**. |
| **W2** | Neue Migration: spaltenscharfes `GRANT UPDATE (col, …) ON users` **ohne** `is_admin`; optional `FORCE ROW LEVEL SECURITY` auf `verified_plates`/`messages`. RLS-Integrationstests (`__tests__/integration/rls.test.ts`) erweitern. **S**. |
| **W3** | In `setPlateVerification` zusätzlich `AND app.is_admin()` bzw. expliziten Admin-Check in die Query aufnehmen; `canReadProof`/`listPendingVerifications` mit redundantem Filter versehen. **S**. |
| **W4/W5** | In `src/lib/auth/server.ts` `advanced.useSecureCookies`, `cookiePrefix`/`__Host-`, `sameSite:"strict"` (soweit UX erlaubt), explizite `trustedOrigins`; `BETTER_AUTH_URL` Fail-Fast. **S**. |
| **W6** | `deleteAccount`-Server-Action (better-auth `deleteUser` aktivieren + Cascade + Proof-Dateien via `prune-proofs`-Logik); Daten-Export für Art. 20; UI in `src/app/dashboard/settings`. Alternativ minimal: Request-Formular, das den dokumentierten Flow anstößt. **M**. |
| **W7** | `prune-sessions.mjs` + `prune-proofs.mjs` als geplanten Job einrichten (Cron-Container in Compose oder dokumentierter systemd-Timer); Retention für `messages` festlegen (Produktentscheidung) + Trigger/Job; `message_throttle`-Altzeilen prunen. **M**. |
| **W8** | Trusted-Proxy-Extraktion: `X-Forwarded-For` mit bekannter Hop-Zahl oder Plattform-IP; entscheiden, ob NULL-Hash blocken statt durchlassen soll. **S**. |
| **W9** | `.github/workflows/ci.yml`: `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` (mit `test:db:up`), `pnpm audit`; `.github/dependabot.yml`; Gitleaks-Job. **S**. |
| **W10** | Sentry (oder self-hosted GlitchTip) + minimaler Logger mit Levels/Redaction; `/api/health` + `healthcheck` für den `web`-Service. **M**. |
| **W11** | Backup-Skript (`pg_dump` + Proofs-Tarball, verschlüsselt, mit Retention) + geplanter Job; Restore-Test dokumentiert. **S**. |
| **W12** | Reihenfolge in `uploadProof` umdrehen (Ownership-Check vor `saveProof`); Magic-Byte-Sniffing der ersten Bytes statt Vertrauen auf `file.type`. **S**. |
| **W13** | HTML-Escape-Helfer für interpolierte Werte in `src/lib/email/templates.ts`. **XS**. |
| **W14** | `minPasswordLength` auf 10–12 anheben (5 Fundstellen synchron); optional Breached-Password-Check. **XS**. |
| **W15** | `lucide-react@1.16.0` gegen npm-Registry verifizieren; ggf. auf bekannte Linie pinnen. **XS**. |
| **W16** | HSTS im `Caddyfile` (mit C3 zusammen). **XS**. |
| **W17** | Doppelten `<footer>` aus `impressum/page.tsx` und `datenschutz/page.tsx` entfernen (mit C1/C2). **XS**. |

---

## Verifikation nach den Fixes

- `pnpm check && pnpm typecheck && pnpm test`
- `pnpm test:db:up && pnpm test:integration` — insbesondere `__tests__/integration/rls.test.ts`
  (W2/W3); Policy testweise brechen und Rotfärbung prüfen (CLAUDE.md-Regel).
- `docker compose up -d && pnpm smoke` — End-to-End inkl. Proof-Traversal-Test.
- Header manuell: `curl -sI https://<domain>/` → CSP/HSTS/X-Frame-Options/nosniff/Referrer-Policy vorhanden.
- `RATE_LIMIT_SALT`/`BETTER_AUTH_URL` leeren → App muss beim Start hart abbrechen.
- `/impressum` und `/datenschutz` im Browser: § 5 DDG genannt, Struktur vollständig, nur ein Footer.
- Rate-Limit: 11 Requests/Minute mit wechselndem `X-Forwarded-For` → nach Fix (W8) geblockt.
