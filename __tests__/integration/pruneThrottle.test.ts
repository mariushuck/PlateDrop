import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ADMIN_URL, migrateFresh, withAdmin } from "./helpers/db";

const execFileAsync = promisify(execFile);

async function seedThrottle(ipHash: string, windowStart: string): Promise<void> {
  await withAdmin((client) =>
    client.query("INSERT INTO message_throttle (ip_hash, window_start, count) VALUES ($1, $2, 1)", [
      ipHash,
      windowStart,
    ]),
  );
}

async function throttleHashes(): Promise<string[]> {
  const { rows } = await withAdmin((client) =>
    client.query<{ ip_hash: string }>("SELECT ip_hash FROM message_throttle ORDER BY ip_hash"),
  );
  return rows.map((r) => r.ip_hash);
}

function runPrune(env: Record<string, string> = {}) {
  return execFileAsync("node", ["scripts/prune-throttle.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_ADMIN_URL: ADMIN_URL, ...env },
  });
}

describe("scripts/prune-throttle.mjs", () => {
  beforeEach(migrateFresh);

  it("entfernt Zeilen aus vergangenen Tagen, behält aktuelle", async () => {
    await seedThrottle("alt", "2020-01-01T00:00:00Z");
    await seedThrottle("frisch", new Date().toISOString());

    await runPrune();

    expect(await throttleHashes()).toEqual(["frisch"]);
  });

  it("respektiert THROTTLE_RETAIN_DAYS", async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    await seedThrottle("vor-drei-tagen", threeDaysAgo);

    await runPrune({ THROTTLE_RETAIN_DAYS: "5" });
    expect(await throttleHashes()).toEqual(["vor-drei-tagen"]);

    await runPrune({ THROTTLE_RETAIN_DAYS: "1" });
    expect(await throttleHashes()).toEqual([]);
  });
});
