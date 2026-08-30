# Admin-Anleitung

Diese Anleitung richtet sich an dich als Betreiber von PlateDrop. **Teil A** beschreibt die
wiederkehrenden Admin-Aufgaben und gilt lokal wie auf dem Server. **Teil B** behandelt alles, was
nur den Serverbetrieb betrifft: Deployment, Secrets, Sicherung, Updates und Störungssuche.

Alle Befehle in diesem Dokument sind gegen den laufenden Stack ausgeführt und geprüft worden.

---

## Vorab: Aus Supabase wurde nichts übernommen

Bei der Umstellung auf das selbst betriebene Backend gab es **keine Datenmigration**. Konkret:

- Die frühere `auth.users`-Tabelle von Supabase und die `profiles`-Tabelle existieren nicht mehr.
  better-auth legt eine eigene, leere `users`-Tabelle an.
- Auch mit Migration wären die Passwörter nicht direkt verwendbar gewesen: Supabase hasht mit
  bcrypt, better-auth mit scrypt.
- Deine alten Zugangsdaten funktionieren also nicht. **Du legst ein neues Konto an** und machst es
  anschließend zum Admin — siehe A1.

---

# Teil A — Admin-Aufgaben

## A1 Das erste Admin-Konto anlegen

Ein frisch aufgesetztes System hat kein einziges Konto. Admin-Rechte lassen sich über die Anwendung
grundsätzlich nicht vergeben (siehe A2), deshalb dieser Weg:

**1. Stack starten**

```bash
docker compose up -d
```

**2. Registrieren** — auf <http://localhost:3000/login> den Reiter *Registrieren* wählen und ein
Konto mit deiner E-Mail-Adresse anlegen.

**3. Adresse bestätigen** — ohne bestätigte Adresse ist keine Anmeldung möglich. Lokal fängt Mailpit
alle E-Mails ab:

```
http://localhost:8025
```

Dort die Nachricht *„PlateDrop: E-Mail-Adresse bestätigen"* öffnen und den Link anklicken.

**4. Admin-Rechte vergeben**

```bash
docker compose run --rm migrate node scripts/set-admin.mjs deine@mail.de
```

Ausgabe bei Erfolg:

```
Admin-Rechte vergeben: deine@mail.de
```

**5. Prüfen** — nach der Anmeldung erscheint im Dashboard oben rechts ein *Admin*-Knopf, und
<http://localhost:3000/admin> lädt statt auf `/dashboard` umzuleiten.

> Die Rechte greifen **sofort beim nächsten Seitenaufruf**. Ein erneutes Anmelden ist nicht nötig,
> weil die Session bei jeder Anfrage frisch aus der Datenbank gelesen wird.

## A2 Admin-Rechte vergeben und entziehen

```bash
# vergeben
docker compose run --rm migrate node scripts/set-admin.mjs person@example.com

# entziehen
docker compose run --rm migrate node scripts/set-admin.mjs person@example.com --revoke
```

Gibt es die Adresse nicht, bricht das Skript ab, ohne etwas zu ändern:

```
Kein Konto mit der Adresse person@example.com gefunden.
```

**Warum nur über die Kommandozeile?** Das Feld `is_admin` ist in
[`src/lib/auth/server.ts`](../src/lib/auth/server.ts) als `input: false` deklariert. better-auth
verwirft es damit aus jedem Registrierungs- und Update-Payload, und keine Server Action fasst es an.
Wer Admin-Rechte vergeben will, braucht Owner-Zugang zur Datenbank — genau den hat das Skript über
`DATABASE_ADMIN_URL`. Ein kompromittiertes Nutzerkonto kann sich so nicht selbst hochstufen.

## A3 Kennzeichen prüfen und freigeben

Unter `/admin` liegen alle Kennzeichen, die auf Prüfung warten **und** bereits ein Beweisfoto haben.
Kennzeichen ohne Foto tauchen nicht auf — dort ist noch nichts zu entscheiden.

Zu jedem Eintrag siehst du das hochgeladene Foto, das Kennzeichen und den Bestätigungscode.

**Freigeben, wenn auf dem Foto alles zusammenpasst:**

- Der Bestätigungscode ist lesbar und stimmt mit dem angezeigten überein
- Das Kennzeichen ist lesbar und stimmt mit dem angezeigten überein
- Beides ist auf **demselben** Bild zu sehen — das ist der ganze Zweck des Verfahrens

**Ablehnen bei:** unleserlichem Code oder Kennzeichen, offensichtlich montierten Bildern, oder wenn
Code und Kennzeichen nicht zusammenpassen.

Mit der Freigabe wird `is_verified` gesetzt, und erst dann kann der Halter die Nachrichten an sein
Kennzeichen lesen.

### Was bei einer Ablehnung passiert

Eine Ablehnung setzt den Status auf `rejected`. Der Halter sieht das Kennzeichen daraufhin in seinem
Dashboard mit einem deutlichen Hinweis und einem Feld für ein neues Foto. Lädt er eines hoch, springt
der Status zurück auf `pending`, und das Kennzeichen erscheint wieder in deiner Liste unter `/admin`.

Du musst dafür nichts tun — der Ablauf läuft ohne Eingriff.

**Was der Halter nicht erfährt:** Es gibt kein Feld für eine Begründung. Er liest nur, dass die
Prüfung nicht erfolgreich war und dass Code und Kennzeichen gut lesbar sein müssen. Bei einem
Sonderfall, den dieser Text nicht abdeckt, ist eine kurze E-Mail hilfreicher als eine wortlose
Ablehnung.

**Wenn ein Anspruch liegen bleibt:** Solange die Zeile existiert, ist die Kennzeichennummer durch den
Unique-Constraint belegt — auch bei Status `rejected`. Meldet sich jemand, weil er sein Kennzeichen
nicht registrieren kann, hilft ein Blick auf den bestehenden Anspruch:

```bash
docker compose exec -T db psql -U platedrop_owner -d platedrop -c \
  "SELECT u.email, vp.verification_status, vp.created_at
     FROM verified_plates vp JOIN users u ON u.id = vp.user_id
    WHERE vp.plate_number = 'KAAB1234';"
```

Ist der Anspruch eindeutig verwaist, entfernst du ihn und gibst die Nummer frei:

```bash
docker compose exec -T db psql -U platedrop_owner -d platedrop -c \
  "DELETE FROM verified_plates WHERE plate_number = 'KAAB1234';"
```

Das dazugehörige Beweisfoto bleibt dabei im Volume liegen und muss separat entfernt werden — den
Pfad vorher aus `proof_image_url` notieren.

## A4 In der Datenbank nachschlagen

Alle Abfragen laufen über den Datenbank-Container. Nutzername und Datenbank stammen aus `.env`
(`POSTGRES_USER`, `POSTGRES_DB`); unten stehen die Vorgaben.

```bash
# Interaktive Sitzung
docker compose exec db psql -U platedrop_owner -d platedrop
```

Für einzelne Abfragen genügt `-c`:

**Alle Konten**

```bash
docker compose exec -T db psql -U platedrop_owner -d platedrop -c \
  'SELECT email, "emailVerified" AS bestaetigt, is_admin AS admin, "createdAt"::date AS seit
     FROM users ORDER BY "createdAt" DESC;'
```

**Offene Verifizierungen mit Kontaktadresse**

```bash
docker compose exec -T db psql -U platedrop_owner -d platedrop -c \
  "SELECT vp.plate_number, vp.verification_code,
          vp.proof_image_url IS NOT NULL AS foto_da, u.email
     FROM verified_plates vp JOIN users u ON u.id = vp.user_id
    WHERE vp.verification_status = 'pending'
    ORDER BY vp.created_at;"
```

**Wem gehört ein Kennzeichen?** Kennzeichen stehen normalisiert in der Datenbank — ohne Bindestriche
und Leerzeichen, in Großbuchstaben. Aus `KA-AB-1234` wird `KAAB1234`.

```bash
docker compose exec -T db psql -U platedrop_owner -d platedrop -c \
  "SELECT u.email, vp.verification_status, vp.is_verified
     FROM verified_plates vp JOIN users u ON u.id = vp.user_id
    WHERE vp.plate_number = 'KAAB1234';"
```

**Kennzeichen eines Nutzers**

```bash
docker compose exec -T db psql -U platedrop_owner -d platedrop -c \
  "SELECT vp.plate_number, vp.verification_status, vp.is_verified
     FROM verified_plates vp JOIN users u ON u.id = vp.user_id
    WHERE lower(u.email) = 'person@example.com';"
```

**Nachrichten an ein Kennzeichen**

```bash
docker compose exec -T db psql -U platedrop_owner -d platedrop -c \
  "SELECT created_at, left(message_text, 60) AS text
     FROM messages WHERE plate_number = 'KAAB1234'
    ORDER BY created_at DESC LIMIT 10;"
```

**Aktive Sitzungen**

```bash
docker compose exec -T db psql -U platedrop_owner -d platedrop -c \
  'SELECT u.email, s."expiresAt", s."ipAddress"
     FROM sessions s JOIN users u ON u.id = s."userId"
    WHERE s."expiresAt" > now();'
```

> Die von better-auth angelegten Spalten sind in camelCase geschrieben und brauchen deshalb doppelte
> Anführungszeichen (`"emailVerified"`, `"userId"`). Unsere eigenen Spalten sind snake_case und
> kommen ohne aus.

## A5 E-Mails prüfen

**Lokal** fängt der Mailpit-Container jede ausgehende Nachricht ab, nichts verlässt den Rechner:

```
http://localhost:8025
```

Praktisch, um Bestätigungs- und Reset-Links direkt zu öffnen, ohne ein echtes Postfach zu brauchen.

**In Produktion** gibt es kein Mailpit. Kommt eine Mail nicht an, liegt es fast immer am Relay —
siehe B3 und die Störungstabelle in B7.

---

# Teil B — Serverbetrieb

In Produktion gehören zu jedem Compose-Aufruf beide Dateien. Der Kürze halber steht unten:

```bash
alias dcp='docker compose -f docker-compose.yml -f docker-compose.prod.yml'
```

Alle folgenden `dcp`-Befehle funktionieren mit vorangestelltem
`docker compose -f docker-compose.yml -f docker-compose.prod.yml` genauso.

## B1 Produktivstart

```bash
cp .env.example .env      # danach ausfüllen, siehe B2 und B3
dcp --profile proxy up -d --build
```

Das startet vier Dienste:

| Dienst    | Aufgabe                                                          |
| --------- | ---------------------------------------------------------------- |
| `db`      | PostgreSQL 18, nur im internen Netz erreichbar                    |
| `migrate` | einmaliger Lauf, spielt offene Migrationen ein, beendet sich dann |
| `web`     | die Anwendung, nicht direkt nach außen exponiert                  |
| `proxy`   | Caddy auf Port 80 und 443, holt das TLS-Zertifikat selbst         |

Voraussetzung für TLS: `DOMAIN` in `.env` zeigt auf deine echte Domain, und deren A-/AAAA-Record
zeigt auf den Server. Caddy fordert das Zertifikat dann beim ersten Aufruf automatisch an.

Ohne Proxy — etwa hinter einem vorhandenen Reverse Proxy — lässt du `--profile proxy` weg und
ergänzt in `docker-compose.prod.yml` ein Port-Mapping für `web`.

## B2 Secrets

Vier Werte müssen vor dem ersten Produktivstart ersetzt werden. Alle erzeugst du so:

```bash
openssl rand -base64 32
```

| Variable             | Wirkung                                           | Beim Rotieren passiert                              |
| -------------------- | ------------------------------------------------- | --------------------------------------------------- |
| `BETTER_AUTH_SECRET` | signiert Sessions und alle Token                  | **alle Nutzer werden abgemeldet**, offene Bestätigungs- und Reset-Links werden ungültig |
| `POSTGRES_PASSWORD`  | Owner-Rolle der Datenbank                          | `DATABASE_ADMIN_URL` muss mitgezogen werden          |
| `APP_DB_PASSWORD`    | Rolle `platedrop_app`, mit der die App verbindet   | `DATABASE_URL` muss mitgezogen werden; der nächste `migrate`-Lauf setzt das Passwort in der Datenbank |
| `RATE_LIMIT_SALT`    | salzt den IP-Hash des Absenderlimits               | laufende Absenderfenster starten neu; niemand wird gesperrt |

Die beiden Datenbank-Passwörter stehen jeweils an zwei Stellen — einmal als eigene Variable, einmal
eingebettet in die Verbindungs-URL. Beide müssen übereinstimmen, sonst startet die App nicht.

## B3 SMTP einrichten

Die Voreinstellung `SMTP_HOST=mailpit` existiert nur im Entwicklungs-Setup. **In Produktion gibt es
keinen Mailpit-Container** — ohne funktionierenden Mailversand kann sich niemand registrieren, denn
die Bestätigung der E-Mail-Adresse ist Pflicht.

```bash
SMTP_HOST=mail.example.com
SMTP_PORT=587
SMTP_SECURE=false        # true nur bei implizitem TLS auf Port 465
SMTP_USER=noreply@example.com
SMTP_PASS=...
MAIL_FROM=PlateDrop <noreply@example.com>
```

Nach dem Ändern `dcp up -d web` und eine Testregistrierung durchführen.

## B4 Sichern

Zwei Dinge sind zu sichern: die Datenbank und die Beweisfotos. **Beide gehören zusammen** — ein
Datenbankstand ohne die passenden Bilder zeigt im Admin-Bereich leere Kacheln.

**Datenbank**

```bash
dcp exec -T db pg_dump -U platedrop_owner -d platedrop --clean --if-exists \
  > platedrop-$(date +%F).sql
```

Der Dump enthält Tabellen, Daten, **alle RLS-Policies, Grants und Funktionen** — also das komplette
Sicherheitsmodell. Nicht enthalten sind die Datenbankrollen selbst; die legt der `migrate`-Service
beim nächsten Start wieder an.

**Beweisfotos**

```bash
docker run --rm \
  -v platedrop_proofs:/data \
  -v "$PWD:/backup" \
  alpine tar czf /backup/proofs-$(date +%F).tar.gz -C /data .
```

> Die Bilder enthalten Kennzeichen und damit personenbezogene Daten. Backups verschlüsselt ablegen
> und die Aufbewahrungsfrist begrenzen.

## B5 Zurückspielen

**Datenbank**

```bash
dcp exec -T db psql -U platedrop_owner -d platedrop < platedrop-2026-08-30.sql
```

`--clean --if-exists` im Dump räumt vorhandene Objekte vorher ab, ein Zurückspielen in die laufende
Datenbank ist also möglich. Danach `dcp restart web`, damit die App keine Verbindungen auf
inzwischen ersetzte Objekte behält.

**Beweisfotos**

```bash
docker run --rm \
  -v platedrop_proofs:/data \
  -v "$PWD:/backup" \
  alpine sh -c 'rm -rf /data/* && tar xzf /backup/proofs-2026-08-30.tar.gz -C /data'
```

**Danach prüfen**, dass das Sicherheitsmodell steht:

```bash
dcp exec -T db psql -U platedrop_owner -d platedrop -tAc \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public';"          # erwartet: 10

dcp exec -T db psql -U platedrop_owner -d platedrop -tAc \
  "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='platedrop_app';"  # erwartet: f | f
```

Liefert die zweite Abfrage irgendwo `t`, greifen die Policies gegenüber der Anwendung nicht mehr —
dann nicht weiterbetreiben, sondern die Rolle korrigieren.

## B6 Updates einspielen

```bash
git pull
dcp --profile proxy up -d --build
```

Der `migrate`-Service läuft dabei automatisch vor `web` und spielt neue Migrationen ein. Seine
Ausgabe zeigt, was passiert ist:

```bash
dcp logs migrate | tail -5
# "keine offenen Migrationen"  oder  "2 Migration(en) angewandt"
```

**Bereits angewandte Migrationsdateien werden nie geändert.** Der Runner merkt sich in
`schema_migrations`, was gelaufen ist, und überspringt es künftig — eine nachträgliche Änderung
würde auf bestehenden Installationen also schlicht nicht ankommen. Schemaänderungen kommen immer als
neue, höher nummerierte Datei in `db/migrations/`.

Vor größeren Updates: erst sichern (B4).

## B7 Logs und Störungssuche

```bash
dcp logs -f web        # Anwendung
dcp logs migrate       # Migrationen, nur der letzte Lauf
dcp logs db            # Datenbank
dcp logs proxy         # Caddy, inklusive Zertifikatsvorgängen
dcp ps                 # Was läuft, was ist gesund
```

| Symptom | Wahrscheinliche Ursache | Prüfschritt |
| --- | --- | --- |
| Registrierung meldet „Registrierung nicht möglich" | Mailversand schlägt fehl, das Konto wird verworfen | `dcp logs web \| grep -i mail`, dann SMTP-Werte gegen B3 prüfen |
| Bestätigungsmail kommt nicht an | Relay lehnt ab, oder `MAIL_FROM` ist nicht zugelassen | Logs des Relays; Absenderadresse muss zur authentifizierten Domain passen |
| Login schlägt trotz richtigem Passwort fehl | Adresse ist noch nicht bestätigt — beide Fälle liefern absichtlich dieselbe Meldung | `SELECT email, "emailVerified" FROM users WHERE email='…';` |
| `/admin` leitet nach `/dashboard` um | Konto hat keine Admin-Rechte | `SELECT is_admin FROM users WHERE email='…';`, dann A2 |
| „Dieses Kennzeichen ist bereits registriert" beim eigenen Kennzeichen | Ein bestehender Anspruch belegt die Nummer — auch ein abgelehnter, den niemand weiterverfolgt | `SELECT * FROM verified_plates WHERE plate_number='…';`, dann A3 |
| Beweisfoto liefert 404 | Datei fehlt im Volume, oder das Kennzeichen gehört jemand anderem | `dcp exec web ls /data/proofs/<nutzer-id>/`; 404 statt 403 ist Absicht und verrät nichts über fremde Pfade |
| Beweisfoto liefert 401 | keine gültige Session | erneut anmelden |
| App startet nicht, Fehler zur Datenbank | `APP_DB_PASSWORD` und das Passwort in `DATABASE_URL` weichen voneinander ab | beide Werte in `.env` vergleichen, dann `dcp up -d` |
| `migrate` bricht ab | fehlerhafte Migrationsdatei; die Transaktion wurde zurückgerollt | `dcp logs migrate`, Datei korrigieren, `dcp up -d migrate` |
| Kein TLS-Zertifikat | `DOMAIN` falsch, DNS zeigt nicht auf den Server, oder Port 80 ist blockiert | `dcp logs proxy \| grep -i certificate` |
| Nachricht wird mit „Zu viele Anfragen" abgelehnt | eines der beiden Limits greift: 10 pro Minute je Absender, 20 pro Stunde je Kennzeichen | `SELECT * FROM message_throttle ORDER BY window_start DESC LIMIT 5;` |

## B8 Datenschutz: Auskunft und Löschung

### Welche personenbezogenen Daten liegen wo

| Ort | Inhalt |
| --- | --- |
| `users` | E-Mail-Adresse, Bestätigungsstatus, Anlagedatum |
| `sessions` | **IP-Adresse im Klartext** und User-Agent je aktiver Sitzung, dazu das Ablaufdatum |
| `verified_plates` | Kennzeichen, Status, Pfad zum Beweisfoto |
| `messages` | Nachrichtentext und Kennzeichen — **ohne Bezug zum Absender** |
| `message_throttle` | gesalzener SHA-256-Hash der Absender-IP, täglich rotierend; keine Klartext-IP |
| Volume `proofs` | Fotos, auf denen Kennzeichen und Umfeld zu sehen sind |

> Wichtig zur Einordnung: Der Nachrichten-Rate-Limiter speichert die IP **nie** im Klartext.
> better-auth legt dagegen in `sessions."ipAddress"` sehr wohl die Klartext-IP der Anmeldung ab —
> sie ist der Schlüssel seiner Anmeldebremse. Mit dem Löschen des Kontos verschwindet die Zeile
> sofort; abgelaufene Sitzungen räumt `prune-sessions.mjs` ab (siehe
> [Regelmäßige Wartung](#b9-regelmäßige-wartung)). Ohne diesen Lauf bleiben sie liegen.

### Auskunft erteilen

```bash
docker compose exec -T db psql -U platedrop_owner -d platedrop -c \
  "SELECT u.email, u.\"createdAt\", vp.plate_number, vp.verification_status
     FROM users u LEFT JOIN verified_plates vp ON vp.user_id = u.id
    WHERE lower(u.email) = 'person@example.com';"
```

### Konto vollständig löschen

Ein einfaches `DELETE FROM users` reicht **nicht**. Es kaskadiert zwar auf `verified_plates`,
`sessions` und `accounts`, lässt aber zwei Dinge zurück. Deshalb in dieser Reihenfolge:

```bash
# 1. Nutzer-ID und Kennzeichen merken — nach dem Löschen sind sie weg
docker compose exec -T db psql -U platedrop_owner -d platedrop -tAc \
  "SELECT id FROM users WHERE lower(email) = 'person@example.com';"
# -> z. B. 8a3e2a40-74bc-427f-a002-60fb9ad6e6b4

docker compose exec -T db psql -U platedrop_owner -d platedrop -tAc \
  "SELECT plate_number FROM verified_plates WHERE user_id = '<nutzer-id>';"

# 2. Nachrichten an diese Kennzeichen löschen (sie hängen NICHT am Konto)
docker compose exec -T db psql -U platedrop_owner -d platedrop -c \
  "DELETE FROM messages WHERE plate_number IN ('KAAB1234');"

# 3. Konto löschen — kaskadiert auf Kennzeichen, Sitzungen und Zugänge
docker compose exec -T db psql -U platedrop_owner -d platedrop -c \
  "DELETE FROM users WHERE lower(email) = 'person@example.com';"

# 4. Beweisfotos entfernen — die Kaskade erreicht das Dateisystem nicht
docker compose run --rm migrate node scripts/prune-proofs.mjs --delete
```

Schritt 4 räumt alle Dateien ab, auf die keine Zeile mehr zeigt — nicht nur die dieses Kontos. Ohne
`--delete` zeigt das Skript zunächst nur an, was es entfernen würde. Mehr dazu unter
[Regelmäßige Wartung](#b9-regelmäßige-wartung).

**Warum die Schritte 2 und 4 nötig sind:**

- `messages` hat bewusst keinen Bezug zum Konto, nur das Kennzeichen. Das schützt die Anonymität der
  Absender — heißt aber, dass Nachrichten eine Kontolöschung überdauern und nur über das Kennzeichen
  adressierbar sind.
- Die Bilddateien liegen im Dateisystem, nicht in der Datenbank. Die Fremdschlüssel-Kaskade erreicht
  sie nicht, deshalb das Aufräumskript.

Bei Schritt 2 abwägen: Das Kennzeichen könnte später von jemand anderem beansprucht werden, der die
alten Nachrichten dann läse. Für eine Löschanfrage ist das Entfernen die richtige Wahl.

## B9 Regelmäßige Wartung

### Verwaiste Beweisfotos entfernen

```bash
# nur anzeigen
docker compose run --rm migrate node scripts/prune-proofs.mjs

# tatsächlich löschen
docker compose run --rm migrate node scripts/prune-proofs.mjs --delete
```

Das Skript vergleicht die Dateien unter `PROOFS_DIR` mit den `proof_image_url`-Werten und meldet
alles, worauf keine Zeile mehr zeigt. Solche Dateien entstehen vor allem, wenn ein Konto per SQL
gelöscht wurde — die Kaskade räumt die Datenbankzeilen ab, das Dateisystem erreicht sie nicht.

Es verbindet sich bewusst als Owner: Die App-Rolle sähe wegen RLS nur die Zeilen eines einzelnen
Nutzers und hielte deshalb sämtliche fremden Fotos für verwaist.

Ein sinnvoller Rhythmus ist monatlich, und nach jeder Kontolöschung.

### Abgelaufene Sitzungen entfernen

```bash
docker compose run --rm migrate node scripts/prune-sessions.mjs
```

better-auth räumt abgelaufene Sitzungen nicht von selbst weg — ohne dieses Skript bleiben sie
unbegrenzt in der Tabelle stehen, samt der darin gespeicherten IP-Adresse.

**Warum die IP überhaupt gespeichert wird:** better-auth nutzt sie, um Anmeldeversuche zu bremsen.
Ohne sie verlöre der eingebaute Schutz gegen das Durchprobieren von Passwörtern seinen Schlüssel.
Begrenzt wird deshalb nicht die Erhebung, sondern die Aufbewahrung: Abgelaufene Sitzungen sind
ohnehin wertlos — sie taugen weder zur Anmeldung noch zur Auswertung.

Wöchentlich ist ein guter Rhythmus. Auf einem Server bietet sich ein Cron-Eintrag an:

```cron
# sonntags um 4 Uhr aufräumen
0 4 * * 0 cd /pfad/zu/platedrop && docker compose run --rm migrate node scripts/prune-sessions.mjs
```
