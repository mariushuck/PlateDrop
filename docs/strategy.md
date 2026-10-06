# PlateDrop – Drei Hebel für Produkt und Geschäftsmodell

Stand: 2026-10-06 · Grundlage: `main` mit Migrationen bis `0009_message_read_window.sql`

> **Richtung (Entscheidung vom 2026-10-06).** PlateDrop entwickelt sich in Richtung **Nische / B2B**,
> Einstieg über Firmenparkplätze, danach Wohnanlagen. Im offenen Privatmarkt ist die
> Monetarisierbarkeit begrenzt (Cold-Start, kaum Zahlungsbereitschaft); dort bleibt PlateDrop ein
> kostenloses Nebenprodukt. Die Gespräche aus [3.9](#39-test-vor-dem-bauen) bleiben das Go/No-Go
> vor dem Mandanten-MVP. Die technischen Arbeitspakete stehen in [TODO.md](../TODO.md) unter P3;
> dieses Dokument ist die Begründung und der Rahmen, keine Spezifikation.

Dieses Dokument beschreibt drei Erweiterungen, die PlateDrop von einer technisch sauberen, aber kaum
nutzbaren App zu einem Produkt mit echtem Nutzen und einem Weg zu Einnahmen machen sollen. Jeder
Hebel hat dieselbe Gliederung: Problem, Lösung, Umsetzung im bestehenden Code, Recht und Datenschutz,
Geschäftsmodell, Risiken, Messgrößen und ein günstiger Test vor dem Bauen.

Die Aufwandsangaben sind Personentage (PT) konzentrierter Arbeit auf der vorhandenen Codebasis.
Sie sind grobe Schätzungen, keine Zusagen. Preise und Zahlungsbereitschaften sind Hypothesen, die im
jeweiligen Test zu prüfen sind. Nichts hier ist Rechtsberatung; die markierten Rechtsfragen gehören
vor dem Go-Live zu einer Anwältin oder einem Anwalt.

| Hebel | Löst | Aufwand | Abhängigkeit |
| --- | --- | --- | --- |
| 0 – Fundament | Squatting, fehlende Empfängerkontrolle | 3–5 PT | keine |
| 2 – Nachrichtentypen und Benachrichtigung | Nachrichten kommen zu spät an, Moderationslast | 8–12 PT | Fundament |
| 1 – Opt-in per QR-Sticker | Absender schreiben ins Leere (Cold-Start) | 5–8 PT | Hebel 2 empfohlen |
| 3 – B2B-Nische | Keine Zahlungsbereitschaft im Privatmarkt | 15–25 PT + Vertrieb | Hebel 1 und 2 |

Die Nummerierung folgt der ursprünglichen Bewertung; die empfohlene Bau-Reihenfolge steht in
Abschnitt 5.

**Abweichung vom Kernsatz.** Hebel 1 (Statusseite für Absender) und Hebel 3 (angemeldete Absender,
Org-Admins) weichen bewusst vom heutigen Grundsatz „öffentlich schreiben, authentifiziert lesen“ ab.
Wer einen dieser Hebel umsetzt, passt `CLAUDE.md` und [architecture.md §5](architecture.md#5-sicherheitsmodell)
im selben Zug an.

---

## 0. Fundament: zwei Lücken, die jeder Hebel voraussetzt

### 0.1 Kennzeichen-Squatting beheben

**Problem.** `verified_plates_plate_unique` erzwingt `UNIQUE (plate_number)` über alle Zeilen,
auch über offene Claims. Wer ein fremdes Kennzeichen beansprucht und nie ein Foto hochlädt, sperrt
den echten Halter dauerhaft aus. Dasselbe passiert beim Halterwechsel: Der Vorbesitzer behält das
Kennzeichen, der neue Halter bekommt „bereits registriert“.

**Lösung.** Eindeutig muss nur der *freigegebene* Claim sein. Offene Claims mehrerer Nutzer dürfen
nebeneinander bestehen; gibt der Admin einen frei, werden die übrigen automatisch abgelehnt bzw. der
bisherige Halter abgelöst.

```sql
-- 0010_claim_competition.sql (Skizze)
ALTER TABLE verified_plates DROP CONSTRAINT verified_plates_plate_unique;

-- Höchstens ein freigegebener Halter je Kennzeichen.
CREATE UNIQUE INDEX verified_plates_one_approved
  ON verified_plates (plate_number)
  WHERE verification_status = 'approved';

-- Ein Nutzer beansprucht dasselbe Kennzeichen nur einmal gleichzeitig.
CREATE UNIQUE INDEX verified_plates_one_open_per_user
  ON verified_plates (user_id, plate_number)
  WHERE verification_status IN ('pending', 'approved');

ALTER TABLE verified_plates DROP CONSTRAINT verified_plates_status_check;
ALTER TABLE verified_plates ADD CONSTRAINT verified_plates_status_check
  CHECK (verification_status IN ('pending', 'approved', 'rejected', 'expired', 'superseded'));
```

Dazu kommen drei Regeln in der Query-Schicht und in `scripts/maintenance.mjs`:

| Regel | Umsetzung |
| --- | --- |
| Offene Claims ohne Foto verfallen nach 7 Tagen | neues `prune-claims` in `maintenance.mjs`, Status `expired` |
| Höchstens 3 offene Claims je Nutzer | Prüfung in `claimPlate`, zusätzlich Rate-Limit (TODO P1) |
| Freigabe löst Konkurrenz auf | `setPlateVerification` setzt in derselben Transaktion andere `pending` auf `rejected` und einen bisherigen `approved` auf `superseded`; der abgelöste Halter bekommt eine Mail |

Das Lesefenster aus `0009` bleibt richtig: Der neue Halter liest ab 30 Tage vor seinem eigenen Claim,
der abgelöste verliert den Zugriff mit dem Statuswechsel, weil die Policy `is_verified = true`
verlangt. Ein RLS-Test für genau diesen Wechsel gehört in `rls.test.ts`.

**Hinweise aus dem Abgleich mit dem Code.**

- `verified_plates` führt `is_verified` getrennt von `verification_status` (`0003_app_tables.sql`).
  Die Übergänge nach `superseded` und `expired` müssen `is_verified = false` mitsetzen, sonst behält
  der abgelöste Halter über die Policy seinen Lesezugriff. Ein `CHECK`, der beide Spalten koppelt
  (`is_verified = (verification_status = 'approved')`), macht das unabhängig von der Query-Schicht.
- Der Index `idx_verified_plates_plate` bleibt nach dem Wegfall der Unique-Constraint der
  Lookup-Index für `plate_number`; nicht versehentlich mitentfernen.
- „Höchstens 3 offene Claims“ und der P1-Punkt „Rate-Limit für Claim und Foto-Upload“ gehören
  zusammen umgesetzt.

### 0.2 Kontrolle für Empfänger

**Problem.** `messages_no_delete` verbietet jedes Löschen, auch für den Empfänger. Melden oder
Pausieren gibt es nicht. Für eine Plattform mit anonymen Absendern ist das zu wenig, und für einen
Hostingdienst verlangt der Digital Services Act ein Melde- und Abhilfeverfahren.

**Lösung.**

| Funktion | Umsetzung |
| --- | --- |
| Nachricht ausblenden | Spalte `hidden_at timestamptz` auf `messages`, UPDATE-Policy nur für den verifizierten Halter und nur auf diese Spalte (spaltenscharfer Grant wie in `0007`) |
| Nachricht melden | Tabelle `message_reports (message_id, reporter_id, reason, created_at, resolved_at)`, Ansicht unter `/admin` |
| Empfang pausieren | Spalte `paused_until` auf `verified_plates`; Nachrichten werden weiter angenommen (sonst verrät die Antwort, dass das Kennzeichen registriert ist), aber nicht angezeigt und nicht benachrichtigt |

Ausblenden statt Löschen hält den Inhalt für eine Meldung oder eine Anzeige vor, bis die reguläre
Löschfrist (`MESSAGE_RETENTION_DAYS`) greift. Diese Frist sollte mit diesem Schritt verpflichtend
gesetzt werden, nicht mehr optional.

**Hinweis aus dem Abgleich mit dem Code.** `messages_no_update` (`0004_policies.sql`) ist heute
`USING (false)`. Für `hidden_at` reicht ein zusätzlicher Grant nicht: Die Policy muss durch eine
ersetzt werden, die nur den verifizierten Halter innerhalb seines Lesefensters zulässt
(`app.message_read_since()`), und der Grant bleibt auf `UPDATE (hidden_at)` beschränkt.

**Aufwand Fundament:** 3–5 PT inklusive Migrationen, Tests und Doku-Update in `architecture.md`.

---

## 1. Hebel 1 – Opt-in per QR-Sticker

### 1.1 Problem

Ein Absender hat nur etwas davon, wenn der Empfänger registriert ist. Bei rund 50 Mio. Pkw in
Deutschland ist ein zufälliges Kennzeichen über Jahre praktisch nie registriert. Der Absender schreibt
ins Leere, merkt es nicht einmal und kommt nicht wieder. Plext in den USA ist mit exakt diesem Konzept
nie über eine Handvoll Nutzer hinausgekommen.

### 1.2 Lösung

Der Halter klebt einen Sticker mit QR-Code innen an die Scheibe. Wer den Code scannt, landet direkt auf
einem Formular, das nur an dieses Fahrzeug schreibt. Der Sticker signalisiert damit vor dem Schreiben,
dass hier jemand erreichbar ist. Das Kennzeichen-Formular auf `/` bleibt bestehen, wird aber zum
Zweitweg.

Der Ablauf aus Sicht der Beteiligten:

| Schritt | Halter | Absender |
| --- | --- | --- |
| Einrichten | legt im Dashboard einen Kontakt-Tag an, lädt das PDF oder bestellt einen Sticker | – |
| Anbringen | klebt den Sticker innen an die Scheibe, außerhalb des Sichtfelds | – |
| Kontakt | – | scannt den Code, wählt eine Nachricht (Hebel 2), sendet |
| Rückmeldung | bekommt Push oder Mail | sieht auf einer Statusseite „zugestellt“ und später „gelesen“ |

Drei Entscheidungen machen den Unterschied:

**Der Tag ist nicht aus dem Kennzeichen abgeleitet.** Der Token ist zufällig (128 Bit, base64url) und
verrät nichts über Fahrzeug oder Halter. Wer den Sticker fotografiert, kann nur an diesen Halter
schreiben, nicht lesen.

**Kein Admin-Foto nötig.** Wer den Sticker an seinem Auto hat, kontrolliert den Kanal. Die manuelle
Freigabe, die heute linear mit den Nutzern wächst, entfällt für diesen Weg vollständig. Die
Kennzeichen-Verifizierung bleibt nur für Nutzer, die auch über das Kennzeichen erreichbar sein wollen.

**Statusrückmeldung an den Absender.** Beim Kennzeichen-Weg darf der Absender nicht erfahren, ob das
Kennzeichen registriert ist; das wäre ein Datenleck über die Teilnahme. Beim Sticker hat der Halter
seine Erreichbarkeit selbst öffentlich gemacht. Hier ist ein Status „zugestellt/gelesen“ zulässig, und
genau der beseitigt das Gefühl, ins Leere zu schreiben.

### 1.3 Umsetzung im Code

**Datenmodell.**

```sql
-- 0012_contact_tags.sql (Skizze)
CREATE TABLE contact_tags (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token       text        NOT NULL UNIQUE,         -- 22 Zeichen base64url aus crypto.randomBytes(16)
  label       text,                                -- nur für den Halter, z. B. "Golf"
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);

ALTER TABLE messages ALTER COLUMN plate_number DROP NOT NULL;
ALTER TABLE messages ADD COLUMN tag_id uuid REFERENCES contact_tags (id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN status_token text UNIQUE;   -- nur bei Tag-Nachrichten
ALTER TABLE messages ADD COLUMN read_at timestamptz;
ALTER TABLE messages ADD CONSTRAINT messages_exactly_one_target
  CHECK ((plate_number IS NULL) <> (tag_id IS NULL));
```

Der Format-`CHECK` aus `0008` braucht dafür keine Änderung: Ein `CHECK` auf `NULL` ergibt `NULL`
und gilt in Postgres als erfüllt. Die Pflicht, `parsePlate` zu durchlaufen, gilt nur für den
Kennzeichen-Weg; Tag-Nachrichten tragen kein Kennzeichen.

**RLS.** Eine zweite SELECT-Policy auf `messages` gibt Tag-Nachrichten frei, wenn
`contact_tags.user_id = app.current_user_id()` und der Tag nicht widerrufen ist. Die Statusseite des
Absenders liest nicht über RLS, sondern über eine `SECURITY DEFINER`-Funktion
`app.message_status(status_token)`, die nur `created_at`, `read_at` und einen groben Status
zurückgibt, nie den Inhalt.

**Routen und Dateien.**

| Pfad | Zweck |
| --- | --- |
| `src/app/t/[token]/page.tsx` | öffentliches Formular für einen Tag; ungültige oder widerrufene Tokens bekommen eine neutrale Fehlerseite |
| `src/app/t/[token]/actions.ts` | `dropTagMessage`, gleiche Rate-Limits wie `dropMessage` |
| `src/app/s/[statusToken]/page.tsx` | Statusseite für den Absender |
| `src/app/dashboard/tags/` | Tags anlegen, umbenennen, widerrufen, PDF herunterladen |
| `src/app/api/tags/[id]/pdf/route.ts` | Sticker-PDF, nur für den Eigentümer |
| `src/lib/tags/token.ts` | Token-Erzeugung mit `crypto.randomBytes` |

Die PDF-Route wäre der vierte Route Handler. Sie ist wie die Foto-Route ein GET ohne Seiteneffekt
und muss in `CLAUDE.md` unter „Mutations and routes“ als weitere Ausnahme aufgenommen werden.

Der QR-Code wird serverseitig als SVG erzeugt (etwa mit dem Paket `qrcode`), das PDF enthält den Code,
eine kurze Zeile „Fahrzeug blockiert, Licht an? Scannen.“ und eine kurze URL als Rückfall ohne Kamera.
Fehlerkorrektur-Stufe M oder Q, damit ein verschmutzter Sticker noch lesbar bleibt.

**Tests.** Unit-Test für die Token-Erzeugung; Integrationstests für die neue Policy (fremder Nutzer
liest keine Tag-Nachricht, widerrufener Tag nimmt nichts mehr an, Statusfunktion liefert keinen
Inhalt); Smoke-Test für den Weg Scan → Nachricht → Dashboard.

**Aufwand:** 5–8 PT.

### 1.4 Recht und Datenschutz

Der Token ist eine dauerhafte Kennung des Fahrzeugs, aber nicht mehr als das Kennzeichen selbst, das
ohnehin sichtbar ist. Nachrichten enthalten keinen Standort. Ein Restrisiko: Jemand klebt einen
eigenen Sticker an ein fremdes Auto und erfährt so, wann andere mit dem Fahrzeug interagieren. Gegen
grobe Fälle hilft, dass die Statusseite und die Nachricht keine Ortsangabe tragen; vollständig
verhindern lässt es sich nicht, es gehört in die Datenschutzerklärung und die Risikoabwägung.

Für den Aufkleber selbst gilt: nicht im Sichtfeld des Fahrers anbringen. Die genaue Zulässigkeit an
der Frontscheibe vor dem Verkauf von Stickern prüfen lassen; die Heckscheibe ist die vorsichtigere
Empfehlung.

### 1.5 Geschäftsmodell

Der Sticker ist das erste Produkt, für das Privatleute plausibel Geld ausgeben, weil es etwas
Physisches ist. Hypothese zum Testen: Selbstausdruck als PDF kostenlos, wetterfester Sticker im
Doppelpack für einen kleinen einstelligen Betrag inklusive Versand. Zunächst manuell über eine
Online-Druckerei abwickeln, kein Shop-System bauen, bevor Bestellungen da sind.

### 1.6 Risiken

| Risiko | Gegenmaßnahme |
| --- | --- |
| Niemand klebt einen Sticker auf | vor dem Bauen testen (1.8) |
| Sticker wird nach Fahrzeugverkauf vergessen | Tag ist an das Konto gebunden, nicht ans Auto; Widerruf im Dashboard; Hinweis bei Kontolöschung |
| Spam über einen fotografierten Code | Rate-Limits pro IP-Hash und pro Ziel greifen wie heute; Pausieren aus 0.2 |

### 1.7 Messgrößen

Anteil angelegter Tags, für die mindestens ein Scan erfolgt; Anteil Scans, die zu einer Nachricht
führen; Anteil Nachrichten, die innerhalb von 15 Minuten gelesen werden; Anteil Absender, die die
Statusseite erneut öffnen.

### 1.8 Test vor dem Bauen

Zwanzig Sticker drucken, die auf eine einfache Seite mit Formular zeigen, und im Bekannten- und
Kollegenkreis verteilen. Nach vier Wochen zählen: Wie viele kleben noch, wie viele Scans gab es, wie
viele Nachrichten waren sinnvoll. Unter einer Handvoll echter Nachrichten lohnt sich der Ausbau nicht.

---

## 2. Hebel 2 – Vordefinierte Nachrichten und Benachrichtigung

### 2.1 Problem

Der Kern-Anwendungsfall ist zeitkritisch. Heute erfährt der Halter von einer Nachricht nur, wenn er
das Dashboard öffnet. „Dein Licht ist an“ drei Tage später ist wertlos. Gleichzeitig ist Freitext von
anonymen Absendern das größte Missbrauchs- und Haftungsrisiko der Plattform.

### 2.2 Lösung

Absender wählen aus einem festen Katalog statt frei zu schreiben, und der Halter wird sofort
benachrichtigt.

**Nachrichtenkatalog (Vorschlag).**

| Code | Text an den Halter | Dringlich |
| --- | --- | --- |
| `licht_an` | Am Fahrzeug brennt noch Licht. | ja |
| `fenster_offen` | Ein Fenster oder das Schiebedach steht offen. | ja |
| `tuer_offen` | Eine Tür oder der Kofferraum ist nicht geschlossen. | ja |
| `blockiert` | Das Fahrzeug blockiert eine Ausfahrt oder ein anderes Fahrzeug. | ja |
| `abschleppen` | Am Fahrzeug steht ein Abschleppwagen oder Ordnungsdienst. | ja |
| `alarm` | Die Alarmanlage ist ausgelöst. | ja |
| `reifen` | Ein Reifen sieht platt aus. | nein |
| `schaden_gesehen` | Am Fahrzeug ist ein Schaden zu sehen. | nein |
| `danke` | Danke fürs rücksichtsvolle Parken. | nein |

Zwei Typen brauchen eine Sonderbehandlung im Formular:

**Tier oder Kind im heißen oder kalten Auto.** Kein eigener Nachrichtentyp. Wählt der Absender etwas
in diese Richtung, zeigt das Formular zuerst 110 und 112. Die App darf nicht den Eindruck erwecken, sie
sei der richtige Kanal für einen Notfall.

**Selbst verursachter Schaden.** Falls ein Typ „Ich habe Ihr Fahrzeug beschädigt“ mit freiwilliger
Kontaktangabe kommt, muss das Formular deutlich sagen, dass eine Nachricht über die App die Pflichten
nach einem Unfall nicht ersetzt (Stichwort unerlaubtes Entfernen vom Unfallort, § 142 StGB). Ohne
juristische Prüfung diesen Typ lieber weglassen.

**Freitext.** Für anonyme Absender entfällt er. In Organisationen aus Hebel 3, wo Absender angemeldet
sind, kann er pro Organisation freigeschaltet werden.

**Benachrichtigungskanäle.**

| Kanal | Umsetzung | Hinweis |
| --- | --- | --- |
| E-Mail | vorhandener `nodemailer`-Transport, neue Vorlage in `src/lib/email/templates.ts` | Betreff und Text nennen nur den Nachrichtentyp und das Kennzeichen bzw. den Tag-Namen |
| Web Push | Service Worker, Web-App-Manifest, Paket `web-push` mit VAPID-Schlüsseln | auf iPhones nur, wenn die App zum Home-Bildschirm hinzugefügt ist; Onboarding muss das erklären |

Einstellungen pro Nutzer: Kanäle an oder aus, Ruhezeiten. Dringliche Typen ignorieren Ruhezeiten,
weil sie sonst ihren Zweck verlieren.

### 2.3 Umsetzung im Code

**Datenmodell.**

```sql
-- 0011_message_types_and_notifications.sql (Skizze)
ALTER TABLE messages ADD COLUMN message_type text;
ALTER TABLE messages ALTER COLUMN message_text DROP NOT NULL;
ALTER TABLE messages ADD CONSTRAINT messages_type_check
  CHECK (message_type IS NULL OR message_type IN (
    'licht_an', 'fenster_offen', 'tuer_offen', 'blockiert', 'abschleppen',
    'alarm', 'reifen', 'schaden_gesehen', 'danke'));
ALTER TABLE messages ADD CONSTRAINT messages_has_content
  CHECK (message_type IS NOT NULL OR message_text IS NOT NULL);

CREATE TABLE push_subscriptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint    text        NOT NULL UNIQUE,
  p256dh      text        NOT NULL,
  auth        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_outbox (
  id           bigserial   PRIMARY KEY,
  message_id   uuid        NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  user_id      text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  attempts     integer     NOT NULL DEFAULT 0,
  sent_at      timestamptz,
  last_error   text
);
```

Die Texte zum Katalog liegen im Code (`src/lib/messages/catalog.ts`), nicht in der Datenbank; der
CHECK sorgt dafür, dass beide nicht auseinanderlaufen. Ein Unit-Test vergleicht Katalog und
Migration.

**Warum eine Outbox statt direktem Versand.** Der öffentliche Insert in `dropMessage` muss für
registrierte und nicht registrierte Kennzeichen gleich schnell und gleich aussehen. Würde die Server
Action selbst Mails oder Pushes verschicken, verriete die Antwortzeit, ob hinter dem Kennzeichen ein
Konto steht. Deshalb legt ein `AFTER INSERT`-Trigger auf `messages` nur dann eine Zeile in
`notification_outbox` an, wenn ein freigegebener, nicht pausierter Halter existiert. Das kostet
Mikrosekunden in der Transaktion. Den Versand übernimmt ein eigener Prozess.

**Versandprozess.** Neuer Compose-Service `notifier` aus demselben Image wie `web` und `migrate`,
Skript `scripts/notifier.mjs`. Er holt offene Einträge mit `SELECT … FOR UPDATE SKIP LOCKED`, schickt
Mail und Push, setzt `sent_at` und versucht Fehlschläge mit wachsendem Abstand erneut. Für kurze
Latenz zusätzlich `LISTEN/NOTIFY` aus dem Trigger, Polling alle paar Sekunden als Rückfall.
Push-Endpunkte, die mit 404 oder 410 antworten, werden gelöscht.

**Weitere Änderungen.**

| Datei | Änderung |
| --- | --- |
| `src/app/page.tsx`, `src/app/actions.ts` | Auswahl statt Textfeld; `dropMessage` nimmt `messageType` statt `messageText` |
| `src/app/dashboard/page.tsx` | Nachrichten mit Typ-Text und Symbol; Ausblenden und Melden aus 0.2; `read_at` setzen beim Öffnen |
| `src/app/dashboard/settings/` | Kanäle, Ruhezeiten, Push-Freigabe |
| `public/sw.js`, `src/app/manifest.ts` | Service Worker und Manifest |
| `next.config.ts` | CSP um `worker-src 'self'` ergänzen; Push-Endpunkte der Browserhersteller werden vom Server angesprochen, nicht vom Browser |
| `.env.example`, `docker-compose*.yml` | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; Service `notifier` |
| `src/app/datenschutz/page.tsx` | Push-Dienste der Browserhersteller als Empfänger, Speicherdauer der Abos |

**Tests.** Integrationstest, dass der Trigger für nicht registrierte und pausierte Kennzeichen keine
Outbox-Zeile anlegt; Test des Notifiers gegen Mailpit; Unit-Test für Ruhezeiten-Logik.

**Aufwand:** 8–12 PT.

### 2.4 Recht und Datenschutz

Ohne Freitext sinkt das Risiko rechtswidriger Inhalte drastisch, weil Absender nur noch harmlose,
vorformulierte Sätze schicken können. Das Melde- und Abhilfeverfahren aus 0.2 bleibt trotzdem nötig.
Benachrichtigungen enthalten bewusst keinen Inhalt, der über den Nachrichtentyp hinausgeht, damit
Sperrbildschirme nichts preisgeben.

### 2.5 Geschäftsmodell

Hebel 2 bringt direkt kein Geld, ist aber die Voraussetzung dafür, dass Hebel 1 und 3 überhaupt einen
Nutzen liefern. Denkbar als späteres Bezahlmerkmal: Benachrichtigung per SMS als Rückfall, weil sie
pro Nachricht Geld kostet und damit einen Preis rechtfertigt.

### 2.6 Risiken

| Risiko | Gegenmaßnahme |
| --- | --- |
| Nutzer erlauben keinen Push | E-Mail als Standard, Push als Angebot nach der ersten Nachricht |
| Benachrichtigungs-Spam | bestehendes Limit von 20 Nachrichten pro Stunde und Kennzeichen; zusätzlich eine Benachrichtigung pro Typ und Viertelstunde bündeln |
| Notifier fällt still aus | Outbox-Alter in `/api/health` aufnehmen; Warnung im Log, wenn ein Eintrag älter als fünf Minuten ist |

### 2.7 Messgrößen

Median der Zeit von Nachricht bis Lesen; Anteil Halter mit aktivem Push; Anteil gelesener Nachrichten
innerhalb von 15 Minuten; Anteil ausgeblendeter oder gemeldeter Nachrichten.

### 2.8 Test vor dem Bauen

Den Katalog als Mock-up zehn Leuten zeigen und fragen, welche Situation ihnen zuletzt passiert ist und
ob sie darin vorkommt. Fehlt etwas Häufiges, gehört es in den Katalog; was niemand nennt, fliegt raus.

---

## 3. Hebel 3 – B2B-Nische statt Massenmarkt

### 3.1 Problem

Privatleute zahlen für ein selten gebrauchtes Werkzeug kaum etwas, und der Cold-Start bleibt im
offenen Markt auch mit Stickern zäh. In geschlossenen Gruppen gibt es beides nicht: Ein Betreiber
bindet alle Nutzer auf einmal an, und er hat ein Budget.

### 3.2 Zielsegmente

| Segment | Schmerz heute | Wer zahlt | Zugang | Einschätzung |
| --- | --- | --- | --- | --- |
| Firmenparkplätze, Werksgelände, Campus | Rundmails „Wem gehört KA-XY?“, Pforte telefoniert Halter hinterher | Facility Management, Standortleitung | über den eigenen Ausbildungsbetrieb und dessen Kontakte | **Einstieg** |
| Wohnanlagen, Tiefgaragen | zugeparkte Stellplätze, Besucherfahrzeuge | Hausverwaltung, ggf. über Nebenkosten | mittel, viele kleine Verwalter | zweiter Schritt |
| Parkhaus- und Parkplatzbetreiber | Licht an, Abschleppfälle, Beschwerden | Betreiber | schwer, große Ketten mit eigener Technik | später |
| Carsharing, Flotten | eigene Telematik vorhanden | – | – | kein Fit |

Der Firmenparkplatz ist der beste Einstieg: Die Nutzer sind bekannt, das Problem tritt dort häufiger
auf als im Privatleben, und die heutige Lösung (Rundmail an alle) stört viele Menschen gleichzeitig.
Das ist das Verkaufsargument.

### 3.3 Lösung

PlateDrop wird mandantenfähig. Eine Organisation hat Mitglieder, Standorte und eigene Regeln.

| Merkmal | Verhalten |
| --- | --- |
| Mitglieder | Einladung per E-Mail über den vorhandenen Mailversand; später Single Sign-on (OIDC), etwa über ein better-auth-Plugin, vorher prüfen |
| Kennzeichen | Mitglieder tragen ihre Kennzeichen ein; ein Org-Admin bestätigt sie oder sie werden aus einer Fuhrpark- bzw. Parkausweisliste importiert. Kein Foto, kein PlateDrop-Admin |
| Absender | Mitglieder angemeldet; Besucher über einen Standort-QR auf Schildern an der Einfahrt (Technik aus Hebel 1) |
| Nachrichten | Katalog aus Hebel 2, pro Organisation erweiterbar; Freitext für angemeldete Absender optional |
| Anonymität | pro Organisation einstellbar: Absendername sichtbar oder nicht |
| Auswertung | nur aggregiert (Anzahl Vorfälle pro Woche), nie pro Person |

### 3.4 Umsetzung im Code

**Datenmodell.**

```sql
-- 0013_organizations.sql (Skizze)
CREATE TABLE organizations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  slug        text        NOT NULL UNIQUE,
  settings    jsonb       NOT NULL DEFAULT '{}',   -- show_sender, allow_free_text, ...
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org_members (
  org_id      uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id     text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('member', 'admin')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE org_sites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name        text        NOT NULL,
  qr_token    text        NOT NULL UNIQUE
);

ALTER TABLE verified_plates ADD COLUMN org_id uuid REFERENCES organizations (id) ON DELETE CASCADE;
ALTER TABLE messages        ADD COLUMN org_id uuid REFERENCES organizations (id) ON DELETE CASCADE;
ALTER TABLE messages        ADD COLUMN sender_id text REFERENCES users (id) ON DELETE SET NULL;

-- Eindeutigkeit des freigegebenen Halters jetzt je Organisation (öffentlich = NULL).
DROP INDEX verified_plates_one_approved;
CREATE UNIQUE INDEX verified_plates_one_approved
  ON verified_plates (org_id, plate_number) NULLS NOT DISTINCT
  WHERE verification_status = 'approved';
```

**RLS.** Neue Hilfsfunktionen nach dem Muster von `app.is_admin()`:
`app.is_org_member(org uuid)` und `app.is_org_admin(org uuid)`, beide `SECURITY DEFINER`. Die
Lese-Policy auf `messages` verlangt zusätzlich, dass `org_id` der Nachricht und des Kennzeichens
übereinstimmen; eine öffentliche Nachricht an `KA-AB-1234` erreicht also nie das Firmenkonto mit
demselben Kennzeichen und umgekehrt. Org-Admins dürfen Kennzeichen ihrer Organisation freigeben,
aber keine Nachrichten lesen, die nicht an sie selbst gehen. Diese Trennung braucht eine eigene
Testgruppe in `rls.test.ts`, weil hier das größte Risiko für ein Datenleck zwischen Mandanten liegt.

Der Vergleich der `org_id` muss `NULL` (öffentlich) als gleichwertig behandeln, also
`m.org_id IS NOT DISTINCT FROM vp.org_id` statt `=`; mit `=` sieht der öffentliche Halter keine
einzige Nachricht mehr.

**Routen.**

| Pfad | Zweck |
| --- | --- |
| `src/app/o/[slug]/` | Bereich der Organisation für Mitglieder |
| `src/app/o/[slug]/admin/` | Mitglieder, Kennzeichen, Standorte, Einstellungen, Statistik |
| `src/app/o/[slug]/s/[siteToken]/` | öffentliches Formular am Standort für Besucher |
| `src/app/invite/[token]/` | Einladung annehmen |

**Abrechnung.** Im Pilot keine. Danach zunächst Rechnung per Hand; ein Zahlungsanbieter erst, wenn
mehr als eine Handvoll Kunden zahlen.

**Aufwand:** 15–25 PT für ein Pilot-taugliches MVP, ohne SSO und ohne Zahlungsintegration.

### 3.5 Recht, Datenschutz und Organisation

**Auftragsverarbeitung.** Im B2B-Fall ist der Kunde Verantwortlicher und PlateDrop
Auftragsverarbeiter (Art. 28 DSGVO). Es braucht einen AV-Vertrag mit jedem Kunden und eine
Beschreibung der technischen und organisatorischen Maßnahmen. `AUDIT.md`, `docs/architecture.md`
und `docs/admin.md` sind dafür eine starke Grundlage und ein Verkaufsargument.

**Betriebsrat.** Ein Werkzeug, das Mitarbeitende und ihre Fahrzeuge erfasst, ist in Unternehmen mit
Betriebsrat voraussichtlich mitbestimmungspflichtig (technische Einrichtungen, die zur Überwachung
geeignet sind, § 87 Abs. 1 Nr. 6 BetrVG). Das früh ansprechen; die Datensparsamkeit (keine
Ortsdaten, keine Auswertung pro Person, Anonymität einstellbar) erleichtert die Zustimmung.

**Eigene Situation.** Wer neben einer Vollzeitstelle ein Gewerbe betreibt, muss in der Regel die
Nebentätigkeit beim Arbeitgeber anzeigen; Details stehen im Arbeitsvertrag. Wichtiger noch beim
Pilot im eigenen Ausbildungsbetrieb: Software, die ein Arbeitnehmer in Erfüllung seiner Aufgaben
schreibt, gehört nach § 69b UrhG dem Arbeitgeber. Der Pilot muss deshalb klar als Kundenbeziehung zu
einem bestehenden, privat entwickelten Produkt laufen, nicht als Arbeitsauftrag, und die Arbeit
daran gehört nicht in die Arbeitszeit. Das vorher schriftlich klären.

**Rechtsform und Haftung.** Für zahlende Firmenkunden und eine Plattform mit nutzergenerierten Inhalten
lohnt eine Beratung, ob eine haftungsbeschränkte Gesellschaft (UG) sinnvoll ist. Sie schützt das
Privatvermögen und erlaubt im Impressum eine Geschäftsanschrift.

### 3.6 Geschäftsmodell

Preis-Hypothesen für den Test, nicht für die Website:

| Modell | Hypothese | Pro | Contra |
| --- | --- | --- | --- |
| Pauschale je Standort | monatlicher Festbetrag, gestaffelt nach Stellplatzzahl | einfach zu kaufen | passt schlecht zu sehr großen Standorten |
| Preis je Stellplatz | kleiner Betrag pro Stellplatz und Monat, mit Mindestbetrag | skaliert mit dem Kunden | Diskussion über die Zählweise |
| Pilot | drei Monate kostenlos gegen Feedback und Referenz | senkt die Einstiegshürde | muss ein Enddatum und eine Preisabsprache haben |

Der Wert für den Kunden lässt sich im Pilot messen: Zahl der Rundmails und Pforten-Anrufe vorher und
nachher, Zeit bis ein blockierendes Fahrzeug weg ist. Diese Zahlen sind später das wichtigste
Verkaufsargument, deshalb vor dem Pilotstart eine Woche lang den Ist-Zustand erheben.

Vertrieb: Pilot, daraus eine Fallstudie, damit Ansprache weiterer Facility-Manager über Kontakte des
Pilotkunden und über berufliche Netzwerke. Wohnanlagen kommen über Hausverwaltungen, die mehrere
Objekte betreuen.

### 3.7 Risiken

| Risiko | Gegenmaßnahme |
| --- | --- |
| Kein Kunde sieht das Problem als groß genug | Gespräche vor dem Bauen (3.9) |
| Mandantentrennung leckt | eigene RLS-Testgruppe, Code-Review der Policies, Penetrationstest vor dem zweiten Kunden |
| Abhängigkeit von einem Pilotkunden | Pilot vertraglich befristen, zweiten Interessenten parallel suchen |
| Konflikt mit dem Arbeitgeber über Rechte am Code | Klärung vor dem Pilot (3.5) |
| Betriebsaufwand für einen Einzelnen | Hosting-Setup bleibt einfach; Monitoring über `/api/health` und Fehler-Aggregation (TODO P2) vor dem ersten zahlenden Kunden |

### 3.8 Messgrößen

Anteil registrierter Fahrzeuge an den Stellplätzen; Vorfälle pro Woche; Median der Zeit bis zur
Reaktion; Rückgang der Rundmails; Umwandlung vom Pilot zum zahlenden Kunden.

### 3.9 Test vor dem Bauen

Fünf Gespräche mit Menschen, die einen Firmenparkplatz oder eine Wohnanlage verantworten. Drei Fragen
reichen: Wie oft passiert es, was tun Sie heute, was kostet Sie das an Zeit und Ärger. Erst wenn
mindestens zwei von fünf einen Pilot ausprobieren wollen, lohnt sich das Mandanten-MVP.

---

## 4. Was über alle Hebel gleich bleibt

Die P0-Punkte aus `TODO.md` gelten unverändert und kommen vor jedem öffentlichen Start: echtes
Impressum und vollständige Datenschutzerklärung, AV-Verträge mit Hosting und Mailversand, frische
Produktions-Secrets, Cron-Jobs, verschlüsselte Backups außer Haus. Jeder Hebel verändert zudem die
Datenschutzerklärung; sie wird mit jeder Migration mitgepflegt, nicht am Ende.

---

## 5. Empfohlene Reihenfolge

| Phase | Inhalt | Aufwand | Ergebnis |
| --- | --- | --- | --- |
| A | Fundament (0.1, 0.2) | 3–5 PT | kein Squatting, Empfänger hat Kontrolle |
| B | Test 2.8, dann Hebel 2 | 8–12 PT | Nachrichten kommen in Minuten an, kein anonymer Freitext mehr |
| C | Test 1.8, dann Hebel 1 | 5–8 PT | Absender wissen, dass sie gehört werden |
| D | Test 3.9 (Gespräche) | 2–3 PT, kein Code | Entscheidung für oder gegen B2B |
| E | Hebel 3 als Pilot-MVP | 15–25 PT | ein Pilotkunde mit gemessenem Nutzen |

Hebel 2 kommt zuerst, weil ohne Benachrichtigung keiner der anderen Hebel einen Nutzen stiftet.
Hebel 1 baut die Token- und QR-Technik, die Hebel 3 für die Standort-Schilder wiederverwendet. Wer
sich nach Phase D gegen B2B entscheidet, hat mit A bis C trotzdem ein rundes, kostenloses Produkt,
das als Portfolio-Projekt mehr zeigt als heute.

Wer nach Phase D klar für B2B ist, kann Phase C auch nach hinten schieben: Für einen Firmenparkplatz
genügen Standort-QR und Kennzeichen; private Sticker sind dort zweitrangig.

**Gewählte Reihenfolge (2026-10-06).** Mit der Entscheidung für die Nische gilt
**A → B → D → E**, Phase C rückt nach hinten. Aus Hebel 1 wird zunächst nur die Token- und
QR-Technik gebaut, und zwar im Rahmen von E für die Standort-Schilder. Die privaten Sticker
(Kontakt-Tags, Statusseite) folgen erst, wenn der Privatmarkt wieder eine Rolle spielt.
[TODO.md](../TODO.md) führt unter P3 nur die technischen Arbeitspakete; die Tests 2.8, 1.8 und 3.9,
die Verträge und die Rechtsfragen aus 3.5 werden hier verfolgt.
