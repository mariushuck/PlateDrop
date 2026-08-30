import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ADMIN_URL, migrateFresh, seedUser, withAdmin } from "./helpers/db";

const execFileAsync = promisify(execFile);

const USER = "11111111-2222-3333-4444-555555555555";

async function seedSession(id: string, expiresAt: string): Promise<void> {
  await withAdmin((client) =>
    client.query(
      `INSERT INTO sessions (id, "expiresAt", token, "updatedAt", "ipAddress", "userId")
       VALUES ($1, $2, $1, now(), '203.0.113.7', $3)`,
      [id, expiresAt, USER],
    ),
  );
}

async function sessionIds(): Promise<string[]> {
  const { rows } = await withAdmin((client) =>
    client.query<{ id: string }>("SELECT id FROM sessions ORDER BY id"),
  );
  return rows.map((r) => r.id);
}

function runPrune() {
  return execFileAsync("node", ["scripts/prune-sessions.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_ADMIN_URL: ADMIN_URL },
  });
}

describe("scripts/prune-sessions.mjs", () => {
  beforeEach(async () => {
    await migrateFresh();
    await seedUser(USER, "halter@example.com");
  });

  it("entfernt abgelaufene Sitzungen", async () => {
    await seedSession("abgelaufen", "2020-01-01T00:00:00Z");

    await runPrune();

    expect(await sessionIds()).toEqual([]);
  });

  it("lässt gültige Sitzungen unberührt", async () => {
    await seedSession("gueltig", "2099-01-01T00:00:00Z");
    await seedSession("abgelaufen", "2020-01-01T00:00:00Z");

    await runPrune();

    expect(await sessionIds()).toEqual(["gueltig"]);
  });

  it("meldet die Anzahl der entfernten Sitzungen", async () => {
    await seedSession("a", "2020-01-01T00:00:00Z");
    await seedSession("b", "2020-01-02T00:00:00Z");

    const { stdout } = await runPrune();

    expect(stdout).toContain("2");
  });

  it("meldet beim zweiten Lauf, dass nichts zu tun war", async () => {
    await seedSession("abgelaufen", "2020-01-01T00:00:00Z");
    await runPrune();

    const { stdout } = await runPrune();

    expect(stdout).toContain("keine abgelaufenen Sitzungen");
  });

  it("entfernt mit der Sitzung auch die darin gespeicherte IP-Adresse", async () => {
    await seedSession("abgelaufen", "2020-01-01T00:00:00Z");

    await runPrune();

    const { rows } = await withAdmin((client) =>
      client.query<{ count: string }>(
        `SELECT count(*) AS count FROM sessions WHERE "ipAddress" IS NOT NULL`,
      ),
    );
    expect(rows[0].count).toBe("0");
  });
});
