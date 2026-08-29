import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

export interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporter: Transporter | null = null;

/**
 * Baut den SMTP-Transport aus der Umgebung. In der Entwicklung zeigt der
 * Mailpit-Container die Nachrichten unter http://localhost:8025 an, in
 * Produktion trägt man hier die Zugangsdaten des echten Relays ein.
 */
function getTransporter(): Transporter {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  if (!host) {
    throw new Error("SMTP_HOST ist nicht gesetzt.");
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    // Mailpit läuft ohne Auth – Zugangsdaten nur setzen, wenn vorhanden.
    auth: user ? { user, pass } : undefined,
  });

  return transporter;
}

export async function sendMail({ to, subject, text, html }: MailOptions): Promise<void> {
  await getTransporter().sendMail({
    from: process.env.MAIL_FROM ?? "PlateDrop <noreply@platedrop.local>",
    to,
    subject,
    text,
    html,
  });
}
