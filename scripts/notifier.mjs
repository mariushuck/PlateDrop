#!/usr/bin/env node
/**
 * Verschickt Benachrichtigungen aus `notification_outbox` (Migration 0013).
 *
 * Läuft dauerhaft als eigener Compose-Service `notifier` und fragt alle
 * NOTIFIER_POLL_MS (Standard 5000) nach fälligen Einträgen. `--once` arbeitet
 * einen Durchgang ab und endet (Tests, manueller Lauf).
 *
 * Mehrere Instanzen stören sich nicht: `FOR UPDATE SKIP LOCKED` gibt jeden
 * Eintrag nur einer. Verbindet sich als Owner, weil die Outbox für die App-Rolle
 * gesperrt ist.
 */
import nodemailer from "nodemailer";
import pg from "pg";
import catalog from "../src/lib/messages/catalog.json" with { type: "json" };
import {
  backoffMs,
  inQuietHours,
  MAX_ATTEMPTS,
  notificationMail,
  quietHoursEnd,
} from "./lib/notify.mjs";

const BY_CODE = new Map(catalog.map((entry) => [entry.code, entry]));
const POLL_MS = Number(process.env.NOTIFIER_POLL_MS ?? 5000);
const BATCH = 20;
const once = process.argv.includes("--once");

function requireEnv(name) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} ist nicht gesetzt.`);
  return value;
}

const pool = new pg.Pool({ connectionString: requireEnv("DATABASE_ADMIN_URL"), max: 2 });
const dashboardUrl = `${requireEnv("BETTER_AUTH_URL").replace(/\/$/, "")}/dashboard`;
const transport = nodemailer.createTransport({
  host: requireEnv("SMTP_HOST"),
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});
const from = process.env.MAIL_FROM ?? "PlateDrop <noreply@platedrop.local>";

/**
 * Lesbare Fehlerursache. Ein Verbindungsfehler bei IPv4 und IPv6 kommt als
 * AggregateError mit leerer `message`; die Ursache steht dann in `code` bzw.
 * in den einzelnen Fehlern.
 */
function describeError(error) {
  if (error?.message) return error.message;
  const inner = error?.errors?.map((e) => e.message || e.code).filter(Boolean);
  return error?.code ?? (inner?.length ? inner.join("; ") : String(error));
}

function log(level, message, meta = {}) {
  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...meta });
  (level === "error" ? console.error : console.log)(line);
}

/** Arbeitet einen Stapel ab. @returns Anzahl bearbeiteter Einträge. */
async function processBatch() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT o.id, o.plate_number, o.message_types, o.attempts, u.email,
              s.email_enabled, s.quiet_start, s.quiet_end
         FROM notification_outbox o
         JOIN users u ON u.id = o.user_id
         LEFT JOIN notification_settings s ON s.user_id = o.user_id
        WHERE o.sent_at IS NULL AND o.attempts < $1 AND o.next_attempt_at <= now()
        ORDER BY o.id
        LIMIT $2
        FOR UPDATE OF o SKIP LOCKED`,
      [MAX_ATTEMPTS, BATCH],
    );

    for (const row of rows) {
      const entries = (row.message_types ?? []).map((code) => BY_CODE.get(code)).filter(Boolean);
      // Ein dringlicher Grund macht die ganze Nachricht dringlich.
      const urgent = entries.some((entry) => entry.urgent);
      const now = new Date();

      // Nach dem Einreihen abgeschaltet: nicht senden, aber als erledigt markieren.
      if (row.email_enabled === false) {
        await client.query(
          "UPDATE notification_outbox SET sent_at = now(), last_error = 'E-Mail abgeschaltet' WHERE id = $1",
          [row.id],
        );
        continue;
      }

      if (!urgent && inQuietHours(now, row.quiet_start, row.quiet_end)) {
        await client.query("UPDATE notification_outbox SET next_attempt_at = $2 WHERE id = $1", [
          row.id,
          quietHoursEnd(now, row.quiet_end),
        ]);
        continue;
      }

      try {
        const mail = notificationMail({
          plate: row.plate_number,
          typeTexts: entries.map((entry) => entry.text),
          dashboardUrl,
        });
        await transport.sendMail({ from, to: row.email, ...mail });
        await client.query("UPDATE notification_outbox SET sent_at = now() WHERE id = $1", [
          row.id,
        ]);
      } catch (error) {
        const attempts = row.attempts + 1;
        await client.query(
          `UPDATE notification_outbox
              SET attempts = $2, next_attempt_at = $3, last_error = $4
            WHERE id = $1`,
          [row.id, attempts, new Date(Date.now() + backoffMs(attempts)), describeError(error)],
        );
        log(attempts >= MAX_ATTEMPTS ? "error" : "warn", "Benachrichtigung fehlgeschlagen", {
          outboxId: row.id,
          attempts,
          error: describeError(error),
        });
      }
    }

    await client.query("COMMIT");
    return rows.length;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    stopping = true;
  });
}

async function main() {
  if (once) {
    await processBatch();
    return;
  }
  log("info", "Notifier gestartet", { pollMs: POLL_MS });
  while (!stopping) {
    try {
      // Volle Stapel sofort weiter abarbeiten, sonst warten.
      const handled = await processBatch();
      if (handled === BATCH) continue;
    } catch (error) {
      log("error", "Notifier-Durchgang fehlgeschlagen", { error: error.message });
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

main()
  .catch((error) => {
    log("error", error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    transport.close();
    return pool.end();
  });
