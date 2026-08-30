/**
 * E-Mail-Vorlagen. Bewusst schlicht gehalten: Text-Teil führt, HTML ist nur
 * eine leicht formatierte Variante desselben Inhalts. Alle Texte auf Deutsch,
 * passend zur Oberfläche.
 */

export interface MailTemplate {
  subject: string;
  text: string;
  html: string;
}

/** Maskiert die HTML-Sonderzeichen, damit interpolierte Werte (URL, E-Mail)
 *  weder aus einem Attribut noch aus dem Textknoten ausbrechen können. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// `heading`, `body` und `actionLabel` sind feste Literale aus diesem Modul;
// `body` darf bewusst Markup enthalten (z. B. <strong>). Dynamische Werte im
// Body maskiert der Aufrufer, `url` maskiert diese Funktion.
function layout(heading: string, body: string, actionLabel: string, url: string): string {
  const safeUrl = escapeHtml(url);
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:32rem;margin:0 auto;padding:1.5rem;color:#0f172a">
  <h1 style="font-size:1.25rem;margin:0 0 1rem">${heading}</h1>
  <p style="margin:0 0 1.5rem;line-height:1.6">${body}</p>
  <p style="margin:0 0 1.5rem">
    <a href="${safeUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:0.75rem 1.25rem;border-radius:0.5rem;text-decoration:none">${actionLabel}</a>
  </p>
  <p style="margin:0;font-size:0.8125rem;color:#64748b;line-height:1.6">
    Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
    <span style="word-break:break-all">${safeUrl}</span>
  </p>
</div>`;
}

export function verificationEmail(url: string): MailTemplate {
  return {
    subject: "PlateDrop: E-Mail-Adresse bestätigen",
    text: `Willkommen bei PlateDrop.\n\nBitte bestätige deine E-Mail-Adresse über diesen Link:\n${url}\n\nWenn du dich nicht registriert hast, kannst du diese E-Mail ignorieren.`,
    html: layout(
      "E-Mail-Adresse bestätigen",
      "Willkommen bei PlateDrop. Bitte bestätige deine E-Mail-Adresse, um dein Konto zu aktivieren.",
      "Adresse bestätigen",
      url,
    ),
  };
}

export function passwordResetEmail(url: string): MailTemplate {
  return {
    subject: "PlateDrop: Passwort zurücksetzen",
    text: `Du hast ein neues Passwort für PlateDrop angefordert.\n\nSetze es über diesen Link neu:\n${url}\n\nWenn du das nicht warst, kannst du diese E-Mail ignorieren — dein Passwort bleibt unverändert.`,
    html: layout(
      "Passwort zurücksetzen",
      "Du hast ein neues Passwort angefordert. Wenn du das nicht warst, kannst du diese E-Mail ignorieren — dein Passwort bleibt unverändert.",
      "Neues Passwort setzen",
      url,
    ),
  };
}

export function emailChangeEmail(url: string, newEmail: string): MailTemplate {
  return {
    subject: "PlateDrop: E-Mail-Änderung bestätigen",
    text: `Für dein PlateDrop-Konto wurde die neue Adresse ${newEmail} hinterlegt.\n\nBestätige die Änderung über diesen Link:\n${url}\n\nWenn du das nicht warst, ignoriere diese E-Mail — die Änderung wird dann nicht wirksam.`,
    html: layout(
      "E-Mail-Änderung bestätigen",
      `Für dein Konto wurde die neue Adresse <strong>${escapeHtml(newEmail)}</strong> hinterlegt. Bestätige die Änderung, damit sie wirksam wird.`,
      "Änderung bestätigen",
      url,
    ),
  };
}
