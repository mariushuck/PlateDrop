import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg, { type Pool } from "pg";
import {
  ADMIN_URL,
  APP_URL,
  clearMailbox,
  daysAgo,
  MAILPIT_API,
  migrateFresh,
  seedPlate,
  seedUser,
  withAdmin,
} from "./helpers/db";

const execFileAsync = promisify(execFile);

/** Schreibt eine Nachricht wie die App: als App-Rolle ohne Nutzer. */
async function drop(plate: string, type: string): Promise<void> {
  const client = new pg.Client({ connectionString: APP_URL });
  await client.connect();
  try {
    await client.query("INSERT INTO messages (plate_number, message_type) VALUES ($1, $2)", [
      plate,
      type,
    ]);
  } finally {
    await client.end();
  }
}

async function outbox() {
  const { rows } = await withAdmin((client) =>
    client.query<{
      user_id: string;
      message_type: string;
      sent_at: Date | null;
      attempts: number;
      next_attempt_at: Date;
      last_error: string | null;
    }>(
      `SELECT user_id, message_type, sent_at, attempts, next_attempt_at, last_error
         FROM notification_outbox ORDER BY id`,
    ),
  );
  return rows;
}

function runNotifier(env: Record<string, string> = {}) {
  return execFileAsync("node", ["scripts/notifier.mjs", "--once"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_ADMIN_URL: ADMIN_URL,
      SMTP_HOST: "localhost",
      SMTP_PORT: "51025",
      SMTP_SECURE: "false",
      MAIL_FROM: "PlateDrop <noreply@platedrop.test>",
      BETTER_AUTH_URL: "https://platedrop.test",
      ...env,
    },
  });
}

async function inbox(): Promise<Array<{ ID: string; Subject: string; To: { Address: string }[] }>> {
  const response = await fetch(`${MAILPIT_API}/messages`);
  return ((await response.json()) as { messages: [] }).messages;
}

function berlinHour(): number {
  const parts = new Intl.DateTimeFormat("de-DE", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: "Europe/Berlin",
  }).formatToParts(new Date());
  return Number(parts.find((part) => part.type === "hour")?.value);
}

describe("Outbox-Trigger", () => {
  beforeEach(migrateFresh);

  it("legt nichts an für unregistrierte und noch nicht freigegebene Kennzeichen", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234");

    await drop("KA-AB-1234", "licht_an");
    await drop("M-XY-9999", "licht_an");

    expect(await outbox()).toEqual([]);
  });

  it("legt für den freigegebenen Halter eine Zeile an", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });

    await drop("KA-AB-1234", "licht_an");

    expect(await outbox()).toMatchObject([
      { user_id: "user-owner", message_type: "licht_an", sent_at: null, attempts: 0 },
    ]);
  });

  it("überspringt pausierte Kennzeichen, eine abgelaufene Pause nicht", async () => {
    const paused = await seedUser("user-paused", "paused@example.com");
    const resumed = await seedUser("user-resumed", "resumed@example.com");
    const pausedPlate = await seedPlate(paused, "KA-AB-1", { verified: true, status: "approved" });
    const resumedPlate = await seedPlate(resumed, "KA-AB-2", {
      verified: true,
      status: "approved",
    });
    await withAdmin(async (client) => {
      await client.query(
        "UPDATE verified_plates SET paused_until = now() + interval '1 hour' WHERE id = $1",
        [pausedPlate],
      );
      await client.query(
        "UPDATE verified_plates SET paused_until = now() - interval '1 hour' WHERE id = $1",
        [resumedPlate],
      );
    });

    await drop("KA-AB-1", "licht_an");
    await drop("KA-AB-2", "licht_an");

    expect((await outbox()).map((o) => o.user_id)).toEqual(["user-resumed"]);
  });

  it("überspringt Halter, die E-Mails abgeschaltet haben", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    await withAdmin((client) =>
      client.query(
        "INSERT INTO notification_settings (user_id, email_enabled) VALUES ($1, false)",
        [owner],
      ),
    );

    await drop("KA-AB-1234", "licht_an");

    expect(await outbox()).toEqual([]);
  });

  it("bündelt denselben Typ innerhalb von 15 Minuten", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });

    await drop("KA-AB-1234", "licht_an");
    await drop("KA-AB-1234", "licht_an");
    await drop("KA-AB-1234", "blockiert");

    expect((await outbox()).map((o) => o.message_type)).toEqual(["licht_an", "blockiert"]);
  });
});

describe("scripts/notifier.mjs", () => {
  beforeEach(async () => {
    await migrateFresh();
    await clearMailbox();
  });

  it("verschickt eine Mail mit Typ und Kennzeichen und markiert den Eintrag", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    await drop("KA-AB-1234", "licht_an");

    await runNotifier();

    const mails = await inbox();
    expect(mails).toHaveLength(1);
    expect(mails[0].To[0].Address).toBe("owner@example.com");
    expect(mails[0].Subject).toContain("KA-AB-1234");
    const detail = (await (await fetch(`${MAILPIT_API}/message/${mails[0].ID}`)).json()) as {
      Text: string;
    };
    expect(detail.Text).toContain("Am Fahrzeug brennt noch Licht.");
    expect(detail.Text).toContain("https://platedrop.test/dashboard");

    const [entry] = await outbox();
    expect(entry.sent_at).not.toBeNull();
  });

  it("hält nicht dringliche Nachrichten in den Ruhezeiten zurück, dringliche nicht", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    const hour = berlinHour();
    await withAdmin((client) =>
      client.query(
        "INSERT INTO notification_settings (user_id, quiet_start, quiet_end) VALUES ($1, $2, $3)",
        [owner, hour, (hour + 2) % 24],
      ),
    );
    await drop("KA-AB-1234", "reifen");
    await drop("KA-AB-1234", "licht_an");

    await runNotifier();

    const entries = await outbox();
    const reifen = entries.find((e) => e.message_type === "reifen");
    const licht = entries.find((e) => e.message_type === "licht_an");
    expect(reifen?.sent_at).toBeNull();
    expect(reifen?.next_attempt_at.getTime()).toBeGreaterThan(Date.now());
    expect(licht?.sent_at).not.toBeNull();
    expect(await inbox()).toHaveLength(1);
  });

  it("versucht es nach einem Fehlschlag später erneut", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    await drop("KA-AB-1234", "licht_an");

    await runNotifier({ SMTP_PORT: "1" });

    const [entry] = await outbox();
    expect(entry.sent_at).toBeNull();
    expect(entry.attempts).toBe(1);
    expect(entry.last_error).toBeTruthy();
    expect(entry.next_attempt_at.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("Benachrichtigungs-Einstellungen und Healthcheck", () => {
  let appPool: Pool;

  beforeAll(() => {
    appPool = new pg.Pool({ connectionString: APP_URL, max: 2 });
  });
  afterAll(() => appPool.end());
  beforeEach(migrateFresh);

  async function asUser<T>(userId: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  it("lässt jeden nur die eigenen Einstellungen sehen und schreiben", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    const stranger = await seedUser("user-stranger", "stranger@example.com");
    await withAdmin((client) =>
      client.query("INSERT INTO notification_settings (user_id) VALUES ($1)", [owner]),
    );

    const seen = await asUser(stranger, (c) => c.query("SELECT * FROM notification_settings"));
    expect(seen.rows).toHaveLength(0);

    await expect(
      asUser(stranger, (c) =>
        c.query("INSERT INTO notification_settings (user_id) VALUES ($1)", [owner]),
      ),
    ).rejects.toThrow(/row-level security|duplicate key/i);
  });

  it("verrät der App-Rolle nur das Alter des ältesten offenen Eintrags", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });

    const empty = await asUser("", (c) => c.query("SELECT app.outbox_lag_seconds() AS lag"));
    expect(Number(empty.rows[0].lag)).toBe(0);

    await drop("KA-AB-1234", "licht_an");
    await withAdmin((client) =>
      client.query("UPDATE notification_outbox SET created_at = now() - interval '10 minutes'"),
    );
    const lag = await asUser("", (c) => c.query("SELECT app.outbox_lag_seconds() AS lag"));
    expect(Number(lag.rows[0].lag)).toBeGreaterThanOrEqual(600);

    await expect(asUser("", (c) => c.query("SELECT * FROM notification_outbox"))).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe("scripts/prune-outbox.mjs", () => {
  beforeEach(migrateFresh);

  it("entfernt versendete und aufgegebene Einträge nach 30 Tagen", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1234", { verified: true, status: "approved" });
    for (const type of ["licht_an", "blockiert", "alarm", "reifen"]) {
      await drop("KA-AB-1234", type);
    }
    await withAdmin(async (client) => {
      const old = daysAgo(31);
      await client.query(
        "UPDATE notification_outbox SET sent_at = $1, created_at = $1 WHERE message_type = 'licht_an'",
        [old],
      );
      await client.query(
        "UPDATE notification_outbox SET attempts = 10, created_at = $1 WHERE message_type = 'blockiert'",
        [old],
      );
      await client.query(
        "UPDATE notification_outbox SET sent_at = now() WHERE message_type = 'alarm'",
      );
    });

    await execFileAsync("node", ["scripts/prune-outbox.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_ADMIN_URL: ADMIN_URL },
    });

    expect((await outbox()).map((o) => o.message_type)).toEqual(["alarm", "reifen"]);
  });
});
