/**
 * Liest eine Pflicht-Umgebungsvariable. Fehlt sie oder ist sie leer, bricht der
 * Aufruf sofort mit einer klaren Meldung ab.
 *
 * Der harte Fehlstart ist Absicht: mehrere Sicherheits- und Datenschutz-
 * garantien hängen an genau solchen Variablen (z. B. der gesalzene IP-Hash an
 * `RATE_LIMIT_SALT`, die Origin-Prüfung und secure Cookies an `BETTER_AUTH_URL`).
 * Ein stiller Fallback auf einen Leerstring liefert einen Dienst, der aussieht,
 * als würde er schützen, es aber nicht tut.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Pflicht-Umgebungsvariable ${name} ist nicht gesetzt. Siehe .env.example.`);
  }
  return value;
}
