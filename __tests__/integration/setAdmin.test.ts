import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ADMIN_URL, migrateFresh, seedUser, withAdmin } from "./helpers/db";

const execFileAsync = promisify(execFile);

function runSetAdmin(args: string[]) {
  return execFileAsync("node", ["scripts/set-admin.mjs", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_ADMIN_URL: ADMIN_URL },
  });
}

describe("scripts/set-admin.mjs", () => {
  beforeEach(migrateFresh);

  it("vergibt Admin-Rechte an ein bestehendes Konto", async () => {
    await seedUser("user-1", "halter@example.com");

    await runSetAdmin(["halter@example.com"]);

    const { rows } = await withAdmin((client) =>
      client.query<{ is_admin: boolean }>("SELECT is_admin FROM users WHERE email = $1", [
        "halter@example.com",
      ]),
    );
    expect(rows).toEqual([{ is_admin: true }]);
  });

  it("entzieht Admin-Rechte mit --revoke", async () => {
    await seedUser("user-1", "chef@example.com", true);

    await runSetAdmin(["chef@example.com", "--revoke"]);

    const { rows } = await withAdmin((client) =>
      client.query<{ is_admin: boolean }>("SELECT is_admin FROM users WHERE email = $1", [
        "chef@example.com",
      ]),
    );
    expect(rows).toEqual([{ is_admin: false }]);
  });

  it("bricht mit Fehler ab, wenn es die Adresse nicht gibt", async () => {
    await expect(runSetAdmin(["gibt-es-nicht@example.com"])).rejects.toThrow(/Kein Konto/);
  });

  it("bricht mit Fehler ab, wenn keine Adresse übergeben wurde", async () => {
    await expect(runSetAdmin([])).rejects.toThrow(/E-Mail-Adresse/);
  });
});
