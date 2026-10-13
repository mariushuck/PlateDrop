import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  ADMIN_URL,
  migrateFresh,
  seedMember,
  seedMessage,
  seedOrg,
  seedOrgAdmin,
  seedPlate,
  seedUser,
  withAdmin,
} from "./helpers/db";

const execFileAsync = promisify(execFile);

function run(script: string, args: string[]) {
  return execFileAsync("node", [`scripts/${script}`, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_ADMIN_URL: ADMIN_URL,
      BETTER_AUTH_URL: "https://platedrop.test",
    },
  });
}

describe("scripts/create-org.mjs", () => {
  beforeEach(migrateFresh);

  it("legt Organisation, Standort und Org-Admin an und nennt die Standort-URL", async () => {
    await seedUser("user-admin", "verwaltung@example.com");

    const { stdout } = await run("create-org.mjs", [
      "--name",
      "Muster Hausverwaltung",
      "--slug",
      "muster",
      "--site",
      "Tiefgarage Nord",
      "--admin",
      "Verwaltung@Example.com",
    ]);

    const { rows } = await withAdmin((client) =>
      client.query<{ slug: string; site: string; token: string; admin: string }>(
        `SELECT o.slug, s.name AS site, s.token, a.user_id AS admin
           FROM organizations o
           JOIN org_sites s ON s.org_id = o.id
           JOIN org_admins a ON a.org_id = o.id`,
      ),
    );
    expect(rows).toEqual([
      {
        slug: "muster",
        site: "Tiefgarage Nord",
        token: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
        admin: "user-admin",
      },
    ]);
    expect(stdout).toContain(`https://platedrop.test/s/${rows[0].token}`);
  });

  it("bricht ab, wenn das Admin-Konto nicht existiert, und legt nichts an", async () => {
    await expect(
      run("create-org.mjs", [
        "--name",
        "X",
        "--slug",
        "x",
        "--site",
        "Y",
        "--admin",
        "nobody@example.com",
      ]),
    ).rejects.toMatchObject({ stderr: expect.stringContaining("nobody@example.com") });

    const { rows } = await withAdmin((client) => client.query("SELECT id FROM organizations"));
    expect(rows).toHaveLength(0);
  });
});

describe("scripts/delete-org.mjs", () => {
  beforeEach(migrateFresh);

  it("zeigt ohne --yes nur, was gelöscht würde", async () => {
    await seedOrg("firma");

    const { stderr } = await run("delete-org.mjs", ["--slug", "firma"]);

    expect(stderr).toContain("--yes");
    const { rows } = await withAdmin((client) => client.query("SELECT id FROM organizations"));
    expect(rows).toHaveLength(1);
  });

  it("schreibt den Export mit --export - auf stdout", async () => {
    await seedOrg("firma");

    const { stdout } = await run("delete-org.mjs", ["--slug", "firma", "--export", "-"]);

    expect(JSON.parse(stdout).organization.slug).toBe("firma");
  });

  it("exportiert alle Daten der Organisation und löscht sie, andere bleiben", async () => {
    const { orgId, siteId } = await seedOrg("firma");
    const other = await seedOrg("andere");
    const member = await seedUser("user-member", "member@example.com");
    const admin = await seedUser("user-orgadmin", "orgadmin@example.com");
    await seedOrgAdmin(orgId, admin);
    await seedMember(siteId, member);
    await seedPlate(member, "KA-AB-1", { verified: true, status: "approved", orgId });
    await seedPlate(member, "KA-AB-1", { verified: true, status: "approved" }); // öffentlich
    await seedMessage("KA-AB-1", "am Standort", undefined, { orgId, siteId });
    await seedMessage("KA-AB-1", "öffentlich");
    await seedMessage("KA-AB-1", "andere Org", undefined, other);
    const file = join(tmpdir(), `platedrop-export-${Date.now()}.json`);

    await run("delete-org.mjs", ["--slug", "firma", "--export", file, "--yes"]);

    const exported = JSON.parse(readFileSync(file, "utf8"));
    expect(exported.organization.slug).toBe("firma");
    expect(exported.admins).toEqual(["orgadmin@example.com"]);
    expect(exported.members).toEqual([
      expect.objectContaining({ email: "member@example.com", status: "active" }),
    ]);
    expect(exported.plates).toEqual([expect.objectContaining({ plate_number: "KA-AB-1" })]);
    expect(exported.messages.map((m: { message_text: string }) => m.message_text)).toEqual([
      "am Standort",
    ]);

    const left = await withAdmin(async (client) => ({
      orgs: (await client.query("SELECT slug FROM organizations")).rows.map((r) => r.slug),
      messages: (await client.query("SELECT message_text FROM messages ORDER BY 1")).rows.map(
        (r) => r.message_text,
      ),
      plates: (await client.query("SELECT org_id FROM verified_plates")).rows,
      users: (await client.query("SELECT id FROM users ORDER BY id")).rows.map((r) => r.id),
    }));
    expect(left).toEqual({
      orgs: ["andere"],
      messages: ["andere Org", "öffentlich"],
      plates: [{ org_id: null }],
      users: ["user-member", "user-orgadmin"],
    });
  });
});
