# Sicherheitsrichtlinie

PlateDrop verspricht, dass nur verifizierte Halter die Nachrichten an ihr Kennzeichen lesen. Jede
Lücke, die dieses Versprechen bricht, ist ernst — danke, wenn du sie meldest.

## Eine Lücke melden

**Bitte kein öffentliches Issue und kein Pull Request.** Beides ist sofort für alle sichtbar.

Melde Schwachstellen vertraulich über GitHub:
**Security → Report a vulnerability**
(<https://github.com/mariushuck/PlateDrop/security/advisories/new>).

Hilfreich sind:

- betroffene Datei oder Route und der Commit, gegen den du getestet hast
- Schritte zum Nachvollziehen, idealerweise gegen einen lokalen Stack (`docker compose up -d`)
- was ein Angreifer damit erreicht, z. B. fremde Nachrichten lesen oder Admin-Rechte erlangen

Bitte teste nur gegen eine eigene, lokale Instanz — nie gegen fremde Installationen oder mit
echten Daten Dritter.

## Was passiert danach

PlateDrop ist ein Ein-Personen-Projekt. Ich bestätige Meldungen so schnell wie möglich und halte
dich über die vertrauliche Advisory auf dem Laufenden. Feste Antwortzeiten kann ich nicht zusagen.
Ist die Lücke behoben, wird sie als Security Advisory veröffentlicht; auf Wunsch mit Nennung.

## Geltungsbereich

- **Im Fokus:** der Branch `main` — Autorisierung (RLS-Policies, `src/lib/db/queries.ts`),
  Authentifizierung, die Route `/api/proofs`, das Rate-Limiting und alles, was Klartext-IPs oder
  andere personenbezogene Daten preisgibt.
- **Nicht im Fokus:** Denial of Service durch reine Last, fehlende Härtung ohne konkreten
  Angriffsweg, Abhängigkeiten mit bekannten Advisories (die meldet Dependabot) sowie Instanzen,
  die nicht nach `docs/admin.md` betrieben werden.

---

## Reporting a vulnerability (English)

Please do **not** open a public issue. Report privately via
**Security → Report a vulnerability**
(<https://github.com/mariushuck/PlateDrop/security/advisories/new>), with the affected file or
route, steps to reproduce against a local stack, and the impact. Test only against your own local
instance. This is a one-person project: reports are answered on a best-effort basis and fixed
issues are published as security advisories.
