# TODO

Was als Nächstes ansteht, nach Priorität. Stand: 2026-10-04 (Branch `dev`).
Herkunft der Punkte: offene Reste aus [AUDIT.md](AUDIT.md) und ein Abgleich von Code und Doku.

Erledigtes hier abhaken und bei Gelegenheit entfernen. Was sich am Verhalten ändert, gehört
zusätzlich in [docs/architecture.md](docs/architecture.md) bzw. [docs/admin.md](docs/admin.md).

---

## P0 — vor dem Go-Live

- [ ] **Impressum mit echten Daten füllen** (Audit C1). Alle mit „Platzhalter" markierten Werte in
  `src/app/impressum/page.tsx` ersetzen (`TODO(go-live)` im Kopfkommentar), danach juristisch prüfen
  lassen.
- [ ] **Betreiber-Platzhalter in der Datenschutzerklärung füllen** (Audit C2): Verantwortlicher,
  Hosting, zuständige Aufsichtsbehörde in `src/app/datenschutz/page.tsx`. Falls
  `MESSAGE_RETENTION_DAYS` gesetzt wird, die Frist dort als Speicherdauer nennen.
- [ ] **AV-Verträge** mit SMTP-Anbieter und Hosting-Provider schließen.
- [ ] **Produktions-`.env`**: alle Secrets frisch mit `openssl rand -base64 32`,
  `BETTER_AUTH_URL=https://<domain>`, `TRUSTED_PROXY_HOPS` passend zum tatsächlichen Proxy-Setup
  (admin.md B1/B2).
- [ ] **Bug: Retention-Variablen erreichen den `migrate`-Container nicht.** `docker-compose.yml`
  reicht `MESSAGE_RETENTION_DAYS` und `THROTTLE_RETAIN_DAYS` nicht durch; per Cron über
  `docker compose run --rm migrate node scripts/maintenance.mjs` gesetzte Fristen werden still
  ignoriert. Beide in `services.migrate.environment` ergänzen, danach den Hinweis „Bekannte Lücke"
  in admin.md B9 entfernen.
- [ ] **Cron-Jobs einrichten** für `scripts/maintenance.mjs` (täglich) und den `backup`-Service
  (täglich), siehe admin.md B9.
- [ ] **Backups außer Haus und verschlüsselt** ablegen; das Volume `backups` liegt auf demselben
  Server wie die Daten. Einen Restore einmal vollständig durchspielen (admin.md B5).
- [x] **Integrationstests grün bestätigen**: CI-Job `integration` grün (Lauf 37219861770,
  2026-10-04).
- [ ] **`dev` nach `main` mergen** per Pull Request (`dev` ist 32 Commits voraus).

## P1 — Absicherung und Tests

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
  Beanspruchen von Kennzeichen oder Hochladen (Audit W1 nannte das fehlende Lockout).
- [ ] **Optional `FORCE ROW LEVEL SECURITY`** auf `verified_plates` und `messages` (Audit-Empfehlung
  zu W2, nicht umgesetzt). Nur mit neuer Migration und RLS-Suite.
- [ ] **Skripte laden keine `.env`-Datei.** Lokal ohne Docker brauchen `pnpm db:migrate`,
  `db:set-admin` und `db:prune` die Variablen aus der Umgebung (README nennt
  `node --env-file=.env.local …`). Bequemer wäre z. B. ein Script-Eintrag mit `--env-file-if-exists`.

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
