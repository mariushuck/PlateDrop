import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ADMIN_URL, migrateFresh, seedMessage, withAdmin } from "./helpers/db";

const execFileAsync = promisify(execFile);

async function backdateMessages(interval: string): Promise<void> {
  await withAdmin((client) =>
    client.query(`UPDATE messages SET created_at = now() - interval '${interval}'`),
  );
}

async function messageCount(): Promise<number> {
  const { rows } = await withAdmin((client) =>
    client.query<{ count: string }>("SELECT count(*) AS count FROM messages"),
  );
  return Number(rows[0].count);
}

function runPrune(env: Record<string, string> = {}) {
  return execFileAsync("node", ["scripts/prune-messages.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_ADMIN_URL: ADMIN_URL, ...env },
  });
}

describe("scripts/prune-messages.mjs", () => {
  beforeEach(migrateFresh);

  // Seit 0012 Pflicht: die Datenschutzerklärung nennt die Frist, und ausgeblendete
  // Nachrichten dürfen nicht unbegrenzt liegen bleiben.
  it("bricht ab und löscht nichts, wenn MESSAGE_RETENTION_DAYS fehlt", async () => {
    await seedMessage("KA-AB-1234", "bleibt");
    await backdateMessages("400 days");

    await expect(runPrune({ MESSAGE_RETENTION_DAYS: "" })).rejects.toMatchObject({
      stderr: expect.stringContaining("MESSAGE_RETENTION_DAYS"),
    });
    expect(await messageCount()).toBe(1);
  });

  it("löscht Nachrichten älter als die Frist, neuere bleiben", async () => {
    await seedMessage("KA-AB-1234", "alt");
    await backdateMessages("100 days");
    await seedMessage("KA-AB-5678", "neu");

    await runPrune({ MESSAGE_RETENTION_DAYS: "90" });

    expect(await messageCount()).toBe(1);
  });
});
