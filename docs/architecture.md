# Technische Dokumentation

PlateDrop ist eine Web-App, mit der sich anonym Nachrichten an deutsche Kennzeichen senden lassen.
Lesen darf sie nur, wer das Kennzeichen nachweislich besitzt. Diese Asymmetrie — **öffentlich
schreiben, authentifiziert lesen** — ist die zentrale Entwurfsvorgabe; nahezu jede Entscheidung im
System dient ihr.

Das Dokument beschreibt, wie das System aufgebaut ist und warum. Für den Betrieb siehe die
[Admin-Anleitung](admin.md).

---

## 1. Überblick

Die Anwendung läuft vollständig selbst betrieben. Es gibt keinen verwalteten Dienst: Datenbank,
Authentifizierung, Dateiablage und Mailversand liegen alle in eigenen Containern.

```mermaid
flowchart LR
    Browser["Browser"]
    Proxy["proxy — Caddy<br/>TLS, Port 80/443"]
    Web["web — Next.js 16<br/>Server Components,<br/>Server Actions"]
    DB[("db — PostgreSQL 18<br/>Volume pgdata")]
    Vol[("Volume proofs<br/>Beweisfotos")]
    SMTP["SMTP<br/>Mailpit / Relay"]
    Migrate["migrate<br/>One-shot"]

    Browser -->|HTTPS| Proxy
    Proxy -->|HTTP| Web
    Web -->|"pg-Pool, Rolle platedrop_app"| DB
    Web -->|Dateisystem| Vol
    Web -->|nodemailer| SMTP
    Migrate -->|"Rolle platedrop_owner"| DB
    Migrate -.->|"läuft vor web"| Web
```

| Container | Aufgabe |
| --- | --- |
| `db` | PostgreSQL 18. Hält Nutzer, Sitzungen, Kennzeichen, Nachrichten und die Rate-Limit-Fenster. |
| `migrate` | Läuft einmal vor `web`, legt die App-Rolle an und spielt offene Migrationen ein. Beendet sich danach. |
| `web` | Die Anwendung. Rendert serverseitig, nimmt Mutationen über Server Actions entgegen. Healthcheck gegen `/api/health`. |
| `proxy` | Caddy, optional über das Compose-Profil `proxy`. TLS-Terminierung, HSTS, holt Zertifikate selbst. |
| `backup` | Nur in Produktion, Compose-Profil `backup`. Einmaliger Lauf von `scripts/backup.sh`: Dump plus Foto-Archiv ins Volume `backups`. |

`web` und `migrate` teilen sich dasselbe Image: Der standalone-Build von Next.js enthält bereits
`pg`, ein zweites Image wäre reiner Ballast. Über `migrate` laufen auch die Wartungsskripte
(`docker compose run --rm migrate node scripts/…`), weil der Service als Owner verbindet und das
Foto-Volume eingebunden hat.

---

## 2. Schichten und Verantwortungen

```mermaid
flowchart TD
    CC["Client Components<br/>Formulare, Knöpfe"]
    SC["Server Components<br/>Seiten, Layouts"]
    SA["Server Actions<br/>alle Mutationen"]
    SESS["lib/auth/session.ts<br/>requireUser / requireAdmin"]
    CTX["lib/db/context.ts<br/>withUser / withAnon"]
    Q["lib/db/queries.ts<br/>sämtliches SQL"]
    RLS["PostgreSQL<br/>RLS-Policies"]

    CC -->|"Aufruf"| SA
    SC --> SESS
    SA --> SESS
    SC --> Q
    SA --> Q
    Q --> CTX
    CTX -->|"Transaktion mit<br/>app.user_id"| RLS
```

| Schicht | Verantwortung |
| --- | --- |
| Client Components | Nur Interaktion: Eingaben entgegennehmen, Zustand anzeigen. **Kein Datenbankzugriff.** |
| Server Components | Daten für die Darstellung laden, Zugang absichern. |
| Server Actions | Eingaben validieren, Mutationen ausführen. Der einzige Schreibweg. |
| `session.ts` | Wer fragt gerade, und darf er das? |
| `queries.ts` | Sämtliches SQL der Anwendung, gebündelt an einer Stelle. |
| `context.ts` | Öffnet die Transaktion und teilt der Datenbank die Identität des Anfragenden mit. |
| Policies | Setzen durch, welche Zeilen dabei überhaupt sichtbar sind. |

**Warum Client Components nicht an die Datenbank dürfen.** Unter Supabase sprachen sie über PostgREST
direkt mit der Datenbank; RLS war dabei die einzige Schranke. Ohne PostgREST gibt es diesen Weg
nicht mehr: Die Zugangsdaten zur Datenbank liegen ausschließlich serverseitig, und in Produktion ist
der Datenbank-Port überhaupt nicht nach außen exponiert. (In der Entwicklung mappt das Override
`localhost:5432` für Werkzeuge wie `psql` — für den Browser ändert das nichts, er hat keine
Zugangsdaten.) Daten kommen deshalb beim Rendern in die Seite, und interaktive Teile
sind kleine Client Components darunter.

---

## 3. Request-Wege

### Server Actions sind der einzige Weg für Mutationen

Nachricht senden, Kennzeichen beanspruchen, Foto hochladen, Freigabe erteilen, Datenexport,
Kontolöschung, alle Auth-Formulare — alles läuft über Server Actions. Für Schreibzugriffe gibt es
bewusst **keine** API-Routen.

### Drei Route Handler als bewusste Ausnahmen

| Route | Warum sie existiert |
| --- | --- |
| [`/api/auth/[...all]`](../src/app/api/auth/[...all]/route.ts) | better-auth braucht sie. Die Links in Bestätigungs- und Reset-Mails müssen auf eine URL zeigen, nicht auf eine Server Action. |
| [`/api/proofs/[...path]`](../src/app/api/proofs/[...path]/route.ts) | **Nur GET, verändert nichts.** Ein `<img>`-Tag braucht eine URL. Prüft bei jedem Abruf Sitzung und Berechtigung neu. |
| [`/api/health`](../src/app/api/health/route.ts) | **Nur GET, verändert nichts.** Container-Healthcheck und Uptime-Monitor brauchen eine URL. Führt `SELECT 1` aus, antwortet 200 oder 503. |

Die Regel „keine API-Routen" gilt für Mutationen. Keine der Ausnahmen schreibt etwas — abgesehen
von better-auth selbst, das über seine Endpunkte Token bestätigt.

### Routen der Anwendung

| Route | Beschreibung | Zugriff |
| --- | --- | --- |
| `/` | Anonyme Nachricht an ein Kennzeichen senden | öffentlich |
| `/login` | Anmeldung und Registrierung | öffentlich |
| `/forgot-password` | Passwort-Reset anfordern | öffentlich |
| `/reset-password` | Neues Passwort setzen, Token aus der E-Mail | öffentlich |
| `/dashboard` | Kennzeichen verwalten, Nachrichten lesen | angemeldet |
| `/dashboard/settings` | E-Mail und Passwort ändern, Daten exportieren, Konto löschen | angemeldet |
| `/admin` | Offene Verifizierungen prüfen | angemeldet + Admin |
| `/impressum`, `/datenschutz` | Rechtliches | öffentlich |
| `/api/auth/[...all]` | better-auth-Endpunkte | öffentlich |
| `/api/proofs/[...path]` | Beweisfoto ausliefern | Halter oder Admin, pro Abruf geprüft |
| `/api/health` | Erreichbarkeit der Datenbank | öffentlich, liefert nur `{"status": …}` |

### Kennzeichen-Normalisierung

Jedes Kennzeichen durchläuft vor jedem Datenbankzugriff `normalizePlate` aus
[`plateUtils.ts`](../src/lib/utils/plateUtils.ts): Bindestriche und Leerzeichen fallen weg, alles
wird großgeschrieben. Aus `KA-AB-1234` wird `KAAB1234`.

Das ist keine Kosmetik. Nachrichten und Kennzeichen werden über `plate_number` verknüpft — würden
Schreib- und Lesepfad unterschiedlich normalisieren, fände der Join in `listMessagesForUser` nichts
mehr, und Halter sähen ihre Nachrichten nicht.

---

## 4. Datenmodell

```mermaid
erDiagram
    users ||--o{ sessions : "hat"
    users ||--o{ accounts : "hat"
    users ||--o{ verified_plates : "beansprucht"
    verified_plates }o..o{ messages : "verknuepft ueber plate_number"

    users {
        text id PK
        text email UK
        boolean emailVerified
        boolean is_admin
    }
    sessions {
        text id PK
        text userId FK
        text token UK
        timestamptz expiresAt
        text ipAddress
    }
    accounts {
        text id PK
        text userId FK
        text providerId
        text password "scrypt-Hash"
    }
    verifications {
        text id PK
        text identifier
        text value
        timestamptz expiresAt
    }
    verified_plates {
        uuid id PK
        text user_id FK
        text plate_number UK
        boolean is_verified
        text verification_status
        text verification_code
        text proof_image_url
    }
    messages {
        uuid id PK
        text plate_number
        text message_text
        timestamptz created_at
    }
    message_throttle {
        text ip_hash PK
        timestamptz window_start
        integer count
    }
```

`messages` und `verified_plates` sind **nicht** über einen Fremdschlüssel verbunden, sondern nur über
den gemeinsamen Wert in `plate_number`. Das ist Absicht: Eine Nachricht existiert unabhängig davon,
ob das Kennzeichen jemals beansprucht wird, und sie trägt keinerlei Spur ihres Absenders.

### Tabellen von better-auth

Erzeugt aus der Konfiguration in [`server.ts`](../src/lib/auth/server.ts), festgehalten in
[`0002_auth.sql`](../db/migrations/0002_auth.sql). Die Spaltennamen stehen in camelCase und brauchen
in SQL doppelte Anführungszeichen.

| Tabelle | Inhalt |
| --- | --- |
| `users` | Konto: E-Mail, Bestätigungsstatus, Anzeigename, `is_admin` |
| `sessions` | Aktive Sitzungen mit Token, Ablauf, IP-Adresse und User-Agent |
| `accounts` | Zugangsverfahren; für E-Mail/Passwort steht hier der scrypt-Hash |
| `verifications` | Kurzlebige Token für Bestätigung, Reset und E-Mail-Wechsel |

`is_admin` ist ein Zusatzfeld auf `users`, deklariert als `input: false` — better-auth verwirft es
aus jedem Request-Payload. Eine eigene `profiles`-Tabelle wie unter Supabase gibt es nicht mehr.

### Fachtabellen

Definiert in [`0003_app_tables.sql`](../db/migrations/0003_app_tables.sql).

**`verified_plates`** — ein beanspruchtes Kennzeichen.

| Spalte | Bedeutung |
| --- | --- |
| `user_id` | Halter, `ON DELETE CASCADE` |
| `plate_number` | normalisiert, projektweit eindeutig |
| `is_verified` | Erst wenn `true`, sind Nachrichten lesbar |
| `verification_status` | `pending`, `approved` oder `rejected`, per CHECK erzwungen |
| `verification_code` | Code im Format `XX-XXXX`, den der Halter aufs Foto legt. Projektweit eindeutig (`0006`) |
| `proof_image_url` | Objektpfad im Volume, nie eine öffentliche URL |

Der Bestätigungscode ist das einzige Geheimnis, das einen Anspruch an das Foto hinter der
Windschutzscheibe bindet. [`verificationCode.ts`](../src/lib/utils/verificationCode.ts) erzeugt ihn
deshalb mit `crypto.randomInt` statt `Math.random`, aus einem Alphabet ohne die verwechselbaren
Zeichen `0/O` und `1/I` — der Code wird von Hand geschrieben und vom Foto abgelesen. Kollidiert ein
Code mit dem Unique-Constraint, würfelt `claimPlate` bis zu fünfmal neu.

**`messages`** — eine anonyme Nachricht. Ein CHECK begrenzt den Text auf 1 bis 500 Zeichen und
spiegelt damit die Validierung der Server Action auf Datenbankebene.

**`message_throttle`** — das rollierende Fenster je Absender. Enthält nur den gesalzenen Hash, nie
eine IP-Adresse.

---

## 5. Sicherheitsmodell

Das Kernversprechen wird auf **zwei voneinander unabhängigen Ebenen** durchgesetzt. Für ein Leck
müssten beide gleichzeitig versagen.

### Ebene 1: Row Level Security

Unter Supabase setzte PostgREST die Policies durch. Ohne PostgREST verbindet sich die Anwendung mit
genau einer Rolle — RLS wäre wirkungslos, wenn diese Rolle zu viel dürfte. Drei Dinge verhindern das:

1. **Die App-Rolle ist schwach.** `platedrop_app` besitzt keine Tabelle, hat kein `BYPASSRLS`, ist
   kein Superuser und bekommt nur die nötigen Grants. Nur unter diesen Bedingungen greifen Policies
   überhaupt gegenüber der Anwendung.
2. **Die Identität kommt pro Transaktion.** `withUser()` in
   [`context.ts`](../src/lib/db/context.ts) öffnet eine Transaktion und setzt die Nutzer-ID als
   Session-Variable. Die Policies lesen sie über `app.current_user_id()`.
3. **Die Variable ist transaktionslokal.** `set_config(..., true)` bindet den Wert an die
   Transaktion. Mit COMMIT oder ROLLBACK verschwindet er und kann nicht an die nächste Anfrage
   durchsickern, die dieselbe Verbindung aus dem Pool erhält.

Punkt 3 ist der subtilste. Ein Integrationstest greift deshalb bewusst **am Kontext vorbei** direkt
auf den Pool zu und prüft, dass dort nichts zurückbleibt — eine Prüfung über `withAnon` würde ein
Durchsickern verdecken, weil sie die Variable selbst neu setzt.

### Die Policies im Einzelnen

Alle aus [`0004_policies.sql`](../db/migrations/0004_policies.sql).

**`verified_plates`**

| Policy | Wirkung |
| --- | --- |
| `verified_plates_select_own` | Ein Nutzer sieht nur Zeilen mit seiner eigenen `user_id`. Anonyme sehen nichts. |
| `verified_plates_select_admin` | Admins sehen alle Zeilen — Grundlage der Freigabe-Ansicht. |
| `verified_plates_insert_own` | Anlegen nur auf eigenen Namen **und** nur mit `is_verified = false` und Status `pending`. Ohne die letzten beiden Bedingungen könnte sich jemand beim Anlegen selbst freischalten. |
| `verified_plates_update_proof_only` | Ändern nur an eigenen Zeilen, und das Ergebnis muss weiterhin unverifiziert sein mit Status `pending` oder `rejected`. Praktisch bleibt damit nur das Nachreichen des Fotos. Das gilt auch nach einer Ablehnung: Der Halter kann ein neues Foto nachreichen, wodurch der Status auf `pending` zurückspringt und das Kennzeichen wieder beim Admin erscheint. |
| `verified_plates_update_admin` | Admins dürfen freigeben und ablehnen. |
| `verified_plates_delete_own` | Ein Nutzer darf eigene Kennzeichen entfernen. |

**`messages`**

| Policy | Wirkung |
| --- | --- |
| `messages_insert_public` | `WITH CHECK (true)` — jede Person darf schreiben, ohne Konto, ohne Login. Der Kern der App. |
| `messages_select_if_verified_owner` | Lesen nur, wenn eine Zeile in `verified_plates` existiert, die dem Anfragenden gehört, auf dasselbe Kennzeichen lautet **und** `is_verified = true` trägt. |
| `messages_no_update` / `messages_no_delete` | `USING (false)`. Zusätzlich fehlt der App-Rolle jedes UPDATE- und DELETE-Recht auf `messages`; der Versuch scheitert deshalb schon am Grant, bevor die Policy greift. Die Policies dokumentieren die Absicht und tragen, falls je ein Grant hinzukäme. |

### Warum die Auth-Tabellen ohne RLS laufen

Auf `users`, `sessions`, `accounts` und `verifications` ist RLS **nicht** aktiviert. Das ist Absicht:
better-auth muss Nutzer anlegen und Sitzungen prüfen, bevor überhaupt ein Nutzerkontext existiert —
bei der Registrierung und bei jedem Login gibt es noch keine `app.user_id`. Diese Tabellen erreicht
ausschließlich die Auth-Bibliothek; die Anwendung fasst sie nie direkt an.

Damit ein künftiger Query-Fehler die fehlende RLS nicht zum Selbst-Hochstufen nutzen kann, darf die
App-Rolle auf `users` seit [`0007_users_column_grants.sql`](../db/migrations/0007_users_column_grants.sql)
nur noch die Spalten ändern, die better-auth tatsächlich schreibt (`name`, `email`,
`"emailVerified"`, `image`, `"updatedAt"`). Ein `UPDATE users SET is_admin = true` scheitert als
`platedrop_app` am Grant; das Flag setzt nur [`set-admin.mjs`](../scripts/set-admin.mjs) als Owner.

`app.is_admin()` liest `users` als `SECURITY DEFINER`. So können die Policies das Admin-Flag prüfen,
ohne der App-Rolle dafür eigene Leserechte auf die Nutzertabelle zu geben.

### Ebene 2: Anwendungsschicht

Jede Funktion in [`queries.ts`](../src/lib/db/queries.ts) filtert **zusätzlich** explizit nach
`user_id`, obwohl die Policy das bereits täte. Die Admin-Abfragen — `listPendingVerifications`,
`setPlateVerification` und der Admin-Zweig von `canReadProof` — tragen stattdessen
`app.is_admin()` im SQL. Admin-Server-Actions prüfen `isAdmin` aus der Session, bevor sie die
Datenbank überhaupt fragen. Geschützte Seiten rufen `requireUser()` oder `requireAdmin()` auf.

Ein vergessener Filter allein führt damit zu keinem Leck, eine fehlerhafte Policy allein ebenso
wenig.

### Beweisfotos

Die Dateien liegen im Volume `proofs` unter `<nutzer-id>/<kennzeichen-id>-<zeitstempel>.<endung>`.

- **Der Pfad wird vor jedem Dateizugriff gegen ein striktes Muster geprüft** — zwei Segmente, UUID
  als Präfix, keine Punkte im Dateinamen außer der Endung. Ein `..` kommt dadurch gar nicht erst
  durch. Ein zweiter Test vergleicht zusätzlich den aufgelösten Pfad mit dem Wurzelverzeichnis.
- **Die Endung stammt aus den ersten Bytes der Datei**, nie aus dem übermittelten Dateinamen und
  nicht aus dem Content-Type — beide kommen vom Client und sind frei wählbar. `sniffImageType`
  erkennt JPEG, PNG, WebP und HEIC an ihrer Signatur; alles andere wird abgewiesen. SVG ist nicht
  erlaubt, weil es Skripte enthalten kann.
- **Erst die Eigentümerschaft, dann die Datei.** `uploadProof` prüft mit `plateBelongsToUser`, ob
  das Kennzeichen dem Aufrufer gehört, bevor irgendetwas ins Volume geschrieben wird. Nach dem
  erfolgreichen Eintrag wird das ersetzte Foto entfernt.
- **Autorisiert wird bei jedem Abruf.** Das ersetzt die früheren Signed URLs von Supabase: Statt
  einen Link zehn Minuten lang gültig zu halten, prüft der Route Handler jedes Mal neu. Wird ein
  Kennzeichen abgelehnt oder gelöscht, endet der Zugriff sofort.
- Ein unberechtigter Abruf liefert **404, nicht 403** — die Antwort verrät damit nicht, ob der Pfad
  existiert.

### Sitzungs-Cookies

[`server.ts`](../src/lib/auth/server.ts) setzt die Cookie-Attribute explizit, statt sich auf die
Voreinstellungen zu verlassen: `useSecureCookies` (samt `__Secure-`-Präfix), sobald
`BETTER_AUTH_URL` mit `https://` beginnt; `httpOnly`; `sameSite: "lax"`. **Nicht `strict`**, weil die
Links aus Bestätigungs- und Reset-Mails Top-Level-Navigationen von fremder Herkunft sind — mit
`strict` käme die Sitzung dort nicht mit. `trustedOrigins` ist auf den Origin der `BETTER_AUTH_URL`
festgelegt.

### HTTP-Security-Header

[`next.config.ts`](../next.config.ts) setzt app-weit eine Content-Security-Policy sowie
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
`Permissions-Policy` (Kamera, Mikrofon, Standort aus) und in Produktion HSTS. Der Header
`X-Powered-By` ist abgeschaltet. Caddy setzt HSTS zusätzlich am Rand und entfernt den
`Server`-Header.

Die CSP kommt **ohne Nonce** aus: Die App hat keine Middleware-Schicht, in der pro Anfrage ein Nonce
entstehen könnte. Für Skripte und Styles bleibt deshalb `'unsafe-inline'` nötig (Hydration,
`next/font`), externe Quellen sind trotzdem vollständig gesperrt, ebenso Einbettung in fremde Frames
(`frame-ancestors 'none'`).

### Konfiguration: lieber nicht starten als still ungeschützt

Mehrere Zusagen hängen an Umgebungsvariablen: der gesalzene IP-Hash an `RATE_LIMIT_SALT`, secure
Cookies und Origin-Prüfung an `BETTER_AUTH_URL`, alle Token an `BETTER_AUTH_SECRET`. Sie werden über
`requireEnv` aus [`env.ts`](../src/lib/env.ts) gelesen, das bei fehlendem oder leerem Wert sofort
abbricht. Ein stiller Rückfall auf einen Leerstring ergäbe einen Dienst, der so aussieht, als würde
er schützen. `docker-compose.yml` erzwingt dieselben Variablen zusätzlich mit `${…:?}`.

---

## 6. Rate-Limiting

Zwei unabhängige Ebenen, beide in [`0005_rate_limit.sql`](../db/migrations/0005_rate_limit.sql), und
beide ohne Klartext-IP.

| Ebene | Grenze | Mechanismus |
| --- | --- | --- |
| Je Absender | 10 Nachrichten pro Minute | Funktion `check_message_rate`, pflegt atomar ein rollierendes Fenster in `message_throttle` |
| Je Kennzeichen | 20 Nachrichten pro Stunde | Trigger `enforce_message_rate_limit` vor jedem INSERT |

**Warum zwei.** Das Absenderlimit bremst Massenversand von einer Stelle aus. Es lässt sich aber über
wechselnde IP-Adressen umgehen — deshalb der Deckel je Kennzeichen als Auffanglinie gegen gezieltes
Fluten einer einzelnen Person.

**Warum keine IP gespeichert wird.** Die Server Action bildet in
[`rateLimit.ts`](../src/lib/utils/rateLimit.ts) einen SHA-256-Hash aus IP, einem geheimen Salt und
dem aktuellen Datum. Nur dieser Hash erreicht die Datenbank. Die tägliche Rotation begrenzt, wie
lange sich Anfragen überhaupt korrelieren lassen. Lässt sich keine IP bestimmen, wird die Anfrage
durchgelassen — der Deckel je Kennzeichen greift dann als Auffanglinie.

**Welche IP gezählt wird.** Jeder Proxy hängt die IP seines Gegenübers hinten an `X-Forwarded-For`
an; was davor steht, kann der Client frei erfinden. `getClientIp` liest deshalb den Eintrag an
Position `länge − TRUSTED_PROXY_HOPS` (Standard 1 = der Caddy aus Compose), nie den ersten.
`TRUSTED_PROXY_HOPS=0` schaltet das Vertrauen in den Header ganz ab. Steht der Wert falsch — etwa 1
ohne vorgeschalteten Proxy —, landet entweder jede Anfrage im selben Fenster oder das Absenderlimit
lässt sich per gefälschtem Header umgehen.

Beide Funktionen sind `SECURITY DEFINER` mit festem `search_path`, und `message_throttle` hat weder
Policy noch Grant: An die Tabelle kommt nur die Funktion selbst heran.

---

## 7. Abläufe

### Anonyme Nachricht senden

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant A as dropMessage
    participant Q as queries.ts
    participant DB as PostgreSQL

    B->>A: Kennzeichen + Text
    A->>A: Kennzeichen validieren
    A->>A: Text pruefen (1..500 Zeichen)
    A->>A: IP salzen und hashen
    A->>Q: checkMessageRate(hash)
    Q->>DB: check_message_rate()
    DB-->>Q: erlaubt / abgelehnt
    alt Absenderlimit erreicht
        A-->>B: Zu viele Anfragen
    else erlaubt
        A->>A: normalizePlate()
        A->>Q: insertMessage()
        Q->>DB: INSERT als anonyme Transaktion
        DB->>DB: Trigger prueft Kennzeichenlimit
        alt Kennzeichenlimit erreicht
            DB-->>Q: check_violation
            A-->>B: Zu viele Anfragen
        else gespeichert
            A-->>B: Erfolg
        end
    end
```

### Kennzeichen verifizieren

```mermaid
sequenceDiagram
    autonumber
    participant H as Halter
    participant App
    participant DB as PostgreSQL
    participant Ad as Admin

    H->>App: Kennzeichen beanspruchen
    App->>DB: INSERT unverifiziert, Status pending
    DB-->>App: Bestaetigungscode XX-XXXX
    App-->>H: Code anzeigen
    Note over H: Code auf Zettel schreiben,<br/>hinter die Scheibe legen,<br/>mit Kennzeichen fotografieren
    H->>App: Foto hochladen
    App->>App: Groesse pruefen (max. 5 MB)
    App->>DB: plateBelongsToUser()
    DB-->>App: eigene Zeile oder nichts
    App->>App: Byte-Signatur pruefen, Endung ableiten
    App->>App: Datei ins Volume schreiben
    App->>DB: Pfad eintragen, Status zurueck auf pending
    App->>App: ersetztes Foto loeschen
    Ad->>App: /admin oeffnen
    App->>DB: offene Verifizierungen laden
    App-->>Ad: Foto, Kennzeichen, Code
    Ad->>App: freigeben
    App->>DB: is_verified = true
    Note over H,DB: Erst jetzt greift<br/>messages_select_if_verified_owner
```

### Beweisfoto abrufen

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant R as /api/proofs
    participant S as session.ts
    participant Q as canReadProof
    participant DB as PostgreSQL
    participant FS as Volume

    B->>R: GET /api/proofs/<pfad>
    R->>S: Sitzung aus Cookie
    alt nicht angemeldet
        R-->>B: 401
    else angemeldet
        R->>Q: canReadProof(nutzer, pfad)
        Q->>DB: SELECT im Nutzerkontext
        Note over DB: Policies entscheiden:<br/>Halter sieht eigene Zeile,<br/>Admin sieht jede
        DB-->>Q: Zeile oder nichts
        alt nichts gefunden
            R-->>B: 404
        else berechtigt
            R->>FS: Pfad pruefen, Datei lesen
            FS-->>R: Bytes
            R-->>B: 200, Cache-Control private no-store
        end
    end
```

### Registrieren und bestätigen

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant A as signUp
    participant BA as better-auth
    participant DB as PostgreSQL
    participant M as SMTP

    B->>A: E-Mail + Passwort
    A->>BA: signUpEmail()
    BA->>DB: users + accounts anlegen
    Note over DB: is_admin = false,<br/>per input:false nicht setzbar
    BA->>DB: Verifizierungstoken ablegen
    BA->>M: Bestaetigungsmail
    A-->>B: Hinweis auf die E-Mail
    B->>BA: Link aus der Mail
    BA->>DB: Token pruefen, emailVerified = true
    Note over B,DB: Erst danach ist ein Login moeglich
```

### Datenexport und Kontolöschung

Beides steht jeder angemeldeten Person unter `/dashboard/settings` zur Verfügung (Art. 15, 17 und 20
DSGVO).

**Export.** Die Server Action `exportMyData` liest über `exportUserData` im Nutzerkontext die eigenen
Kennzeichen und die Nachrichten an die eigenen **verifizierten** Kennzeichen, ergänzt die
Kontodaten aus der Session und gibt alles als JSON zurück; der Browser bietet es als Download an.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant A as deleteAccount
    participant BA as better-auth
    participant FS as Volume
    participant DB as PostgreSQL

    B->>A: Passwort zur Bestaetigung
    A->>BA: deleteUser(password)
    BA->>BA: Passwort pruefen
    BA->>FS: beforeDelete: deleteAllProofsForUser()
    BA->>DB: DELETE FROM users
    Note over DB: Kaskade: sessions, accounts,<br/>verified_plates
    A-->>B: Weiterleitung auf /
```

Nachrichten bleiben bei der Löschung bestehen: Sie hängen nur am Kennzeichen, nicht am Konto, und
tragen keine Spur ihres Absenders. Wie Admins mit Löschanträgen umgehen, die auch diese Nachrichten
betreffen, steht in der [Admin-Anleitung, B8](admin.md#b8-datenschutz-auskunft-und-löschung).

---

## 8. Migrationen

Das Schema besteht aus nummerierten SQL-Dateien in [`db/migrations/`](../db/migrations/), angewandt
von [`scripts/migrate.mjs`](../scripts/migrate.mjs).

| Datei | Inhalt |
| --- | --- |
| `0001_roles_and_schema.sql` | Schema `app`, Funktion `app.current_user_id()`, Rechte der App-Rolle |
| `0002_auth.sql` | Tabellen von better-auth, erzeugt aus der Konfiguration |
| `0003_app_tables.sql` | `verified_plates`, `messages`, `message_throttle` |
| `0004_policies.sql` | RLS-Policies und Grants — das Sicherheitsmodell |
| `0005_rate_limit.sql` | Trigger und Funktion für beide Limits |
| `0006_verification_code_unique.sql` | `UNIQUE (verification_code)`; setzt etwaige Doppel-Codes aus der Zeit vor dem CSPRNG auf NULL |
| `0007_users_column_grants.sql` | Spaltenscharfes `UPDATE` auf `users` für die App-Rolle, ohne `is_admin` |

Der Runner verbindet sich als Owner, stellt zuerst die Rolle `platedrop_app` sicher und spielt dann
jede noch nicht vermerkte Datei **in einer eigenen Transaktion** ein. Was gelaufen ist, steht in
`schema_migrations`.

**Angewandte Dateien werden nie geändert.** Der Runner überspringt sie anhand des Dateinamens; eine
nachträgliche Änderung käme auf bestehenden Installationen nie an. Schemaänderungen kommen immer als
neue, höher nummerierte Datei.

Das Auth-Schema in `0002` lässt sich bei einem better-auth-Upgrade mit
[`scripts/generate-auth-schema.mjs`](../scripts/generate-auth-schema.mjs) neu erzeugen — gegen eine
leere Datenbank, sonst enthält der Plan nur die Differenz zum Ist-Zustand.

---

## 9. Teststrategie

Drei Ebenen mit unterschiedlichem Zuschnitt, dazu die CI.

| Ebene | Befehl | Deckt ab |
| --- | --- | --- |
| Unit | `pnpm test` | Kennzeichenlogik, Bestätigungscode, Claim-Formular, Ablage und Pfadprüfung der Beweisfotos samt Byte-Signatur, IP-Ermittlung und -Hashing, `requireEnv`, HTML-Escaping der Mailvorlagen. Braucht kein Docker. |
| Integration | `pnpm test:db:up && pnpm test:integration` | Policies, Data-Access-Modul (inkl. Code-Kollision und Datenexport), Transaktionskontext, Migrations-Runner, Admin-Skript, alle Prune-Skripte, Mailversand, die öffentliche Server Action. Läuft gegen echtes Postgres und Mailpit. |
| End-to-End | `pnpm smoke` | Der vollständige Ablauf über HTTP gegen den laufenden Stack: Registrierung, Bestätigungsmail, Login, geschützte Seiten, Auslieferung der Beweisfotos, Passwort-Reset, Ablehnung und erneutes Einreichen. |
| CI | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Bei jedem Push auf `main`/`dev` und jedem PR: `pnpm check`, `typecheck`, Unit-Tests, `build`, die Integrationssuite gegen Service-Container, `pnpm audit --audit-level high` und ein gitleaks-Secret-Scan. Dependabot schlägt wöchentlich Updates vor. |

Die wichtigste Datei ist [`__tests__/integration/rls.test.ts`](../__tests__/integration/rls.test.ts).
Sie prüft die Kernzusagen direkt gegen die Policies: anonym schreiben aber nicht lesen, keine fremden
Nachrichten, nichts vor der Freigabe, kein Selbst-Freischalten, kein Admin-Zugriff ohne Admin-Recht.

**Diese Tests wurden gegengeprüft, indem die jeweilige Policy absichtlich kaputt gemacht und der
Testlauf beobachtet wurde** — RLS abschalten, `app.is_admin()` auf `true` festnageln, den
Eigentümerfilter entfernen. Jede Mutation wurde erkannt. Zwei Tests fielen bei dieser Prüfung durch
und mussten ersetzt werden, weil sie das behauptete Verhalten gar nicht messen konnten.

Wer eine Policy ändert, führt diese Suite aus. Und schreibt den Test zuerst.

---

## 10. Betrieb und Beobachtbarkeit

- **Logging.** Server-Code protokolliert über [`logger.ts`](../src/lib/logger.ts) statt direkt über
  `console`. In Produktion entsteht je Eintrag eine JSON-Zeile (`level`, `time`, `message`, bei
  Fehlern `error` und `stack`), in der Entwicklung lesbarer Text. Ein externer Fehlerdienst ist
  nicht angebunden; er ließe sich hier an einer Stelle andocken.
- **Healthcheck.** `/api/health` prüft die Datenbankverbindung; der `web`-Container meldet darüber
  seinen Zustand an Docker.
- **Datenpflege und Sicherung.** `scripts/maintenance.mjs` bündelt die Prune-Skripte (abgelaufene
  Sitzungen, alte Rate-Limit-Zeilen, optional alte Nachrichten, verwaiste Fotos),
  `scripts/backup.sh` sichert Datenbank und Fotos. Beide sind für Cron gedacht; Einrichtung und
  Rhythmus stehen in der [Admin-Anleitung, B4 und B9](admin.md#b9-regelmäßige-wartung).

---

## 11. Verzeichnisstruktur

```
.github/                CI-Workflow und Dependabot
db/migrations/          Schema, Policies, Rate-Limits und Grants als nummerierte SQL-Dateien
scripts/                Migrations-Runner, Admin-Skript, Prune-Skripte, maintenance.mjs,
                        backup.sh, Rauchtest, Auth-Schema-Generator
src/app/                Routen; jede actions.ts enthaelt die Server Actions ihres Bereichs
src/app/api/            Die drei bewussten Route Handler (auth, proofs, health)
src/components/         features/ fuer fachliche Formulare, ui/ fuer Rahmenelemente
src/lib/auth/           better-auth-Konfiguration, Session-Helfer, Passwortregel
src/lib/db/             Pool, Transaktionskontext, saemtliches SQL, Zeilentypen
src/lib/email/          Mailversand und Vorlagen
src/lib/storage/        Ablage, Lesen und Loeschen der Beweisfotos
src/lib/utils/          Kennzeichenlogik, Bestaetigungscode, IP-Ermittlung und -Hashing
src/lib/env.ts          Pflicht-Umgebungsvariablen mit Fail-Fast
src/lib/logger.ts       Strukturiertes Logging
__tests__/              unit (utils, components, lib) und integration/
```

Die Dateien, die man zuerst lesen sollte:

- [`src/lib/db/context.ts`](../src/lib/db/context.ts) — hier entsteht der Nutzerkontext für RLS
- [`src/lib/db/queries.ts`](../src/lib/db/queries.ts) — sämtliches SQL der Anwendung
- [`db/migrations/0004_policies.sql`](../db/migrations/0004_policies.sql) — das Sicherheitsmodell
- [`src/lib/auth/server.ts`](../src/lib/auth/server.ts) — wie Auth konfiguriert ist
