/**
 * Reine Logik des Notifiers, ohne Datenbank und SMTP – dadurch einzeln testbar.
 */

const BERLIN_HOUR = new Intl.DateTimeFormat("de-DE", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: "Europe/Berlin",
});

/** Stunde (0–23) in Europe/Berlin. */
export function berlinHour(date) {
  // formatToParts statt format: de-DE schreibt sonst „14 Uhr".
  return Number(BERLIN_HOUR.formatToParts(date).find((part) => part.type === "hour")?.value);
}

/**
 * Liegt `date` in den Ruhezeiten [start, end)? Über Mitternacht (22 → 7)
 * zählt alles ab `start` und alles vor `end`. Ohne Ruhezeiten: nie.
 */
export function inQuietHours(date, start, end) {
  if (start == null || end == null || start === end) return false;
  const hour = berlinHour(date);
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * Nächster Zeitpunkt, an dem die Ruhezeit endet: volle Stunde `end` in Berlin.
 * shortcut: rechnet in ganzen Stunden ab jetzt; an den beiden Zeitumstellungen
 * kann das um eine Stunde danebenliegen – für Benachrichtigungen unerheblich.
 */
export function quietHoursEnd(date, end) {
  const hoursLeft = (end - berlinHour(date) + 24) % 24 || 24;
  const next = new Date(date.getTime() + hoursLeft * 3_600_000);
  next.setUTCMinutes(0, 0, 0);
  return next;
}

/** Wartezeit nach dem n-ten Fehlschlag: 30 s, 60 s, 120 s … höchstens 1 h. */
export function backoffMs(attempts) {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 3_600_000);
}

/** Nach so vielen Fehlschlägen gibt der Notifier einen Eintrag auf. */
export const MAX_ATTEMPTS = 10;

/**
 * Mail an den Halter. Bewusst nur Gründe und Kennzeichen: Benachrichtigungen
 * erscheinen auf Sperrbildschirmen. `typeTexts` sind die Katalogsätze der
 * Nachricht; leer bei Freitext.
 */
export function notificationMail({ plate, typeTexts, dashboardUrl }) {
  const lines = typeTexts.length > 0 ? typeTexts : ["Du hast eine neue Nachricht."];
  const heading =
    lines.length === 1
      ? `<h1 style="font-size:1.25rem;margin:0 0 1rem">${escapeHtml(lines[0])}</h1>`
      : `<ul style="font-size:1.0625rem;font-weight:600;margin:0 0 1rem;padding-left:1.25rem">${lines
          .map((line) => `<li style="margin:0 0 0.375rem">${escapeHtml(line)}</li>`)
          .join("")}</ul>`;
  return {
    subject: `PlateDrop: Nachricht für ${plate}`,
    text: `${lines.join("\n")}\n\nKennzeichen: ${plate}\n\nZur Nachricht: ${dashboardUrl}\n\nBenachrichtigungen und Ruhezeiten stellst du in den Kontoeinstellungen ein.`,
    html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:32rem;margin:0 auto;padding:1.5rem;color:#0f172a">
  ${heading}
  <p style="margin:0 0 1.5rem">Kennzeichen: <strong>${escapeHtml(plate)}</strong></p>
  <p style="margin:0 0 1.5rem"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#0f172a;color:#fff;padding:0.75rem 1.25rem;border-radius:0.5rem;text-decoration:none">Zur Nachricht</a></p>
  <p style="margin:0;font-size:0.8125rem;color:#64748b">Benachrichtigungen und Ruhezeiten stellst du in den Kontoeinstellungen ein.</p>
</div>`,
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
