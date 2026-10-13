# PlateDrop für Privatgelände – Markteintritt

Stand: 2026-10-13 · baut auf [strategy.md §3](strategy.md#3-hebel-3--b2b-nische-statt-massenmarkt) auf

> **Entscheidung (2026-10-13).** PlateDrop wird ein **universelles Produkt für Privatgelände**:
> Firmenparkplätze, Wohnanlagen über Hausverwaltungen und private Parkflächen nutzen denselben
> Mandanten-Kern. Segmente unterscheiden sich in Käufer, Kanal, Preis und Rechtsrahmen, nicht im
> Code. Welches Segment den ersten Pilot stellt, entscheidet Phase 0.

Dieses Dokument ist der Arbeitsplan für den Markteintritt und die Liste der nicht-technischen
Schritte. Die technischen Pakete stehen in [TODO.md](../TODO.md) unter P3 (Phasen A, B, E).
Begründung, Datenmodell und Rechtsfragen stehen in [strategy.md](strategy.md) und werden hier nicht
wiederholt. Preise sind Hypothesen für Gespräche, keine Angebote. Nichts hier ist Rechtsberatung.

---

## 1. Positionierung

**Ein Satz:** PlateDrop erreicht den Halter eines Fahrzeugs auf Ihrem Gelände in Minuten, ohne
Rundmail, ohne Aushang, ohne dass jemand Telefonnummern herausgeben muss.

Was ein Gelände für PlateDrop geeignet macht:

| Merkmal | Warum |
| --- | --- |
| bekannter, wiederkehrender Nutzerkreis | Mitglieder registrieren sich einmal, der Cold-Start aus dem offenen Markt entfällt |
| ein Betreiber mit Verantwortung für das Gelände | er kauft, lädt ein und gibt Kennzeichen frei |
| enge oder gemeinsam genutzte Stellflächen | Zuparken und Blockieren passieren regelmäßig |
| heute eine teure oder störende Notlösung | Rundmail, Pforte, Aushang, Abschleppdienst |

Nicht geeignet: offene öffentliche Parkplätze ohne festen Nutzerkreis, Flotten mit eigener
Telematik (siehe strategy.md §3.2).

## 2. Anwendungsfälle

Für alle Segmente gleich, über den Katalog aus [strategy.md §2.2](strategy.md#22-lösung):

| Fall | Typischer Ort | Absender |
| --- | --- | --- |
| Fahrzeug blockiert Ausfahrt oder anderes Fahrzeug | Werkshof, Tiefgarage, Hinterhof | Mitglied oder Besucher |
| Duplex-/Stapelparker: oben muss weg, damit unten raus kann | Tiefgarage einer Wohnanlage | Mitglied |
| Licht an, Fenster offen, Alarm | überall | Mitglied oder Besucher |
| Besucher steht falsch und wird gesucht | Klinik, Hotel, Praxis, Firmenempfang | Betreiber, Pforte |
| Danke / Hinweis auf Schaden | überall | Mitglied |

**Grenze, offen kommunizieren:** Ein fremdes Fahrzeug ohne Konto ist nicht erreichbar. Für
Fremdparker bleiben Hinweis an den Betreiber und im Zweifel der Abschleppdienst. PlateDrop löst die
Konflikte *innerhalb* des Nutzerkreises und mit Besuchern, die über den Standort-QR schreiben.

## 3. Segmente

| Segment | Käufer | Schmerz heute | Zugang | Preisanker im Gespräch | Rechtliche Besonderheit |
| --- | --- | --- | --- | --- | --- |
| Firmenparkplatz, Werk, Campus | Facility Management, Standortleitung | Rundmails „Wem gehört …?“, Pforte telefoniert | eigener Ausbildungsbetrieb und dessen Kontakte, FM-Netzwerke | Arbeitszeit von Pforte und Belegschaft | Betriebsrat (§ 87 Abs. 1 Nr. 6 BetrVG), AV-Vertrag |
| Wohnanlage, Tiefgarage | Hausverwaltung, bei WEG die Eigentümergemeinschaft | Zettel an der Scheibe, Anrufe bei der Verwaltung, Streit unter Nachbarn | Hausverwaltungen als Multiplikator (ein Vertrag, viele Objekte) | Arbeitszeit der Verwaltung, Beschwerden | Mieterdaten nicht weitergeben → Selbst-Beitritt (§ 4); bei WEG ggf. Beschluss nötig (prüfen) |
| Private Betreiber: Hotel, Klinik, Praxis, Verein, Händler | Inhaber, Haustechnik | Besucher blockieren Lieferzonen oder Notzufahrten | lokal, persönlich, über Kunden der ersten beiden Segmente | Ausfallzeit, Abschleppkosten | AV-Vertrag; Besucher schreiben anonym |

Der Firmenparkplatz hat den kürzesten Zugang (eigener Betrieb), die Hausverwaltung den größten
Hebel (viele Objekte je Vertrag). Beide werden in Phase 0 parallel befragt.

## 4. Was daraus für das Produkt folgt

Alle Punkte sind generisch und seit 2026-10-13 umgebaut (Migration `0014`, siehe
[architecture.md](architecture.md#organisationen-0014)); der Aushang ist eine druckbare Seite unter
`/o/<slug>/admin`, Organisationen legt der Betreiber per `scripts/create-org.mjs` an
([admin.md, Teil C](admin.md#teil-c--organisationen)):

- **Standort-Scope.** Eine Hausverwaltung hat viele Objekte, eine Firma mehrere Werke. Mitglieder
  und Kennzeichen hängen am Standort; der Standort-QR erreicht nur dessen Mitglieder.
- **Selbst-Beitritt per Aushang-QR mit Freigabe durch den Org-Admin.** In Wohnanlagen importiert die
  Verwaltung keine Mieterlisten; Bewohner treten freiwillig bei. Das löst zugleich die Frage, auf
  welcher Grundlage Mieterdaten verarbeitet werden. Import aus Fuhrpark- oder Parkausweislisten
  bleibt für Firmen.
- **Aushang je Standort** (druckbare Seite, im Browser als PDF speicherbar). Das wichtigste Vertriebs- und Onboarding-Material ist ein Schild an
  der Einfahrt und ein Aushang im Treppenhaus.
- **Offboarding und Vertragsende.** Auszug, Austritt und Kündigung müssen Zugriffe sofort beenden
  und Daten löschen können; das fragt jeder Datenschutzbeauftragte.
- **Neutrale Begriffe in der Oberfläche:** „Gelände“, „Standort“, „Mitglied“ statt „Mitarbeiter“
  oder „Mieter“.

Bewusst nicht im Pilot: Self-Service-Registrierung von Organisationen (Onboarding per
`scripts/create-org.mjs`), Zahlungsanbieter, SSO, Stellplatzverwaltung.

## 5. Angebot und Preis-Hypothesen

| Baustein | Hypothese |
| --- | --- |
| Pilot | 3 Monate kostenlos, festes Enddatum, Preis für danach vorab schriftlich vereinbart, Gegenleistung: Vorher/Nachher-Zahlen und Referenz |
| Preis Firma | monatlich je Standort, gestaffelt nach Stellplätzen (strategy.md §3.6) |
| Preis Hausverwaltung | Rahmenvertrag je Verwaltung, Abrechnung je Objekt nach Stellplätzen; ob der Betrag über die Betriebskosten umlagefähig ist, rechtlich prüfen |
| Preis private Betreiber | kleine Pauschale je Standort |
| Abrechnung | per Rechnung von Hand, bis mehr als eine Handvoll Kunden zahlen |

In jedem Gespräch nach dem heutigen Aufwand fragen (Stunden pro Woche, Anrufe, Rundmails) und daraus
den Preisanker ableiten, nicht umgekehrt.

## 6. Phasen mit Go/No-Go

### Phase 0 — Prüfen (kein Code, 2–4 Wochen)

- P0 aus [TODO.md](../TODO.md) abschließen; ohne Impressum, Datenschutzerklärung und AV-Verträge
  kein Gespräch über einen Pilot.
- Test aus [strategy.md §3.9](strategy.md#39-test-vor-dem-bauen) auf **8–10 Gespräche** erweitern:
  mindestens 3 Hausverwaltungen, 3 Firmen, 2 private Betreiber. Dieselben drei Fragen: Wie oft
  passiert es, was tun Sie heute, was kostet Sie das an Zeit und Ärger.
- Bei Interesse: eine Woche Ist-Zustand erheben lassen (Rundmails, Anrufe, Zeit bis ein blockierendes
  Fahrzeug weg ist).
- **Go**, wenn mindestens zwei Gesprächspartner einen Pilot zusagen, egal aus welchem Segment. Das
  Segment mit den Zusagen stellt den ersten Pilot; das Produkt bleibt universell.
- **No-Go**, wenn niemand das Problem als relevant einstuft: Phase A und B trotzdem bauen
  (kostenloses Produkt, strategy.md §5), Mandanten-MVP zurückstellen.

### Phase 1 — Pilot (TODO P3 A → B → E)

- 1–2 Gelände, Onboarding von Hand: Organisation per Skript, Aushang und Schild drucken, kurze
  Einweisung des Org-Admins.
- Wöchentlich die Messgrößen aus §8 ablesen, nach 4 und 12 Wochen ein kurzes Gespräch.
- **Go** für Phase 2: der Pilotkunde verlängert zu einem Preis oder nennt einen konkreten Grund,
  warum nicht.

### Phase 2 — Referenz und Kanal

- Fallstudie mit Vorher/Nachher-Zahlen, mit Freigabe des Pilotkunden.
- Kanäle nach Segment: Hausverwaltungen direkt und über regionale Verwalterverbände; Eigentümer über
  Haus & Grund; Firmen über FM-Netzwerke, IHK und Kontakte des Pilotkunden; private Betreiber lokal.
- Ziel: zweiter und dritter Kunde, davon mindestens einer aus einem anderen Segment als der Pilot,
  um die Universalität zu belegen.

### Phase 3 — Skalieren

Erst wenn mehr als eine Handvoll Kunden zahlen: Self-Service-Onboarding, Zahlungsanbieter,
Penetrationstest vor dem zweiten Mandanten (strategy.md §3.7), Fehler-Aggregation und
Uptime-Monitoring (TODO P2/Phase E).

## 7. Vertriebsmaterial

| Material | Inhalt | Wann |
| --- | --- | --- |
| One-Pager | Problem, Ablauf in drei Schritten, Datenschutz in drei Sätzen, Pilotangebot | Phase 0 |
| Klickbarer Ablauf oder Screenshots | Absender scannt, wählt Nachricht, Halter bekommt Push | Phase 0 |
| Schild- und Aushangvorlage | QR, Kurz-URL, ein Satz Nutzen | Phase 1 (PDF aus der App) |
| Info-Text für Bewohner oder Belegschaft | Was gespeichert wird, wie man beitritt und austritt | Phase 1 |
| AV-Vertrag und TOM | aus [architecture.md](architecture.md), [admin.md](admin.md) und [AUDIT.md](../AUDIT.md) abgeleitet, juristisch geprüft | vor Phase 1 |
| Datenschutz-FAQ für Betriebsrat, Beirat, Datenschutzbeauftragte | keine Ortsdaten, keine Auswertung pro Person, Anonymität einstellbar, Löschfristen | vor Phase 1 |
| Demo-Gelände | Organisation mit Testdaten zum Vorführen | Phase 1 |

## 8. Messgrößen

Aus [strategy.md §3.8](strategy.md#38-messgrößen), je Gelände: Anteil registrierter Fahrzeuge an
den Stellplätzen, Vorfälle pro Woche, Median der Zeit bis zur Reaktion, Rückgang von Rundmails und
Anrufen, Umwandlung vom Pilot zum zahlenden Kunden. Zusätzlich für Wohnanlagen: Anteil der Haushalte,
die per Aushang-QR beigetreten sind.

## 9. Risiken je Segment

Die allgemeinen Risiken stehen in [strategy.md §3.7](strategy.md#37-risiken). Dazu:

| Risiko | Segment | Gegenmaßnahme |
| --- | --- | --- |
| Zu wenige Bewohner treten bei, der Nutzen bleibt aus | Wohnanlage | Aushang plus Anschreiben der Verwaltung; Pilot erst ab einer Tiefgarage mit spürbarem Problem (Duplex-Parker) |
| Betriebsrat blockiert oder verzögert | Firma | früh einbinden, Datenschutz-FAQ, Anonymität per Einstellung |
| Hausverwaltung will Mieterlisten importieren | Wohnanlage | Selbst-Beitritt als einziger Weg, mit Begründung im FAQ |
| Kleine Betreiber zahlen nicht | private Betreiber | erst nach Referenzen ansprechen, Pauschale niedrig halten |
| Fokusverlust durch drei Segmente | alle | ein Produkt, ein Pilot zur Zeit; Segmente nur in Gesprächen parallel |

## 10. Checkliste nicht-technischer Schritte

Hier abhaken; technische Pakete stehen in [TODO.md](../TODO.md).

- [ ] Nebentätigkeit beim Arbeitgeber anzeigen; Rechte am Code und Pilot im eigenen Betrieb
      schriftlich klären (strategy.md §3.5, § 69b UrhG).
- [ ] Beratung zur Rechtsform (UG) und Haftung.
- [ ] One-Pager und Gesprächsleitfaden erstellen.
- [ ] Gespräche Phase 0: 3 Hausverwaltungen, 3 Firmen, 2 private Betreiber; Ergebnisse hier notieren.
- [ ] Go/No-Go-Entscheidung festhalten (Datum, Segment des ersten Pilots).
- [ ] AV-Vertragsvorlage und TOM juristisch prüfen lassen.
- [ ] Datenschutz-FAQ für Betriebsrat, Beirat und Datenschutzbeauftragte.
- [ ] Bei Wohnanlagen klären: braucht der Einsatz einen WEG-Beschluss, ist der Preis umlagefähig?
- [ ] Pilotvertrag mit Enddatum und vereinbartem Folgepreis.
- [ ] Ist-Zustand beim Pilotkunden eine Woche lang erheben.
- [ ] Fallstudie nach Pilotende.
