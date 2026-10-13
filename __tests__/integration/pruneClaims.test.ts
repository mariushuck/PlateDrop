import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ADMIN_URL, daysAgo, migrateFresh, seedPlate, seedUser, withAdmin } from "./helpers/db";

const execFileAsync = promisify(execFile);

function runPrune() {
  return execFileAsync("node", ["scripts/prune-claims.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_ADMIN_URL: ADMIN_URL },
  });
}

async function statuses(): Promise<Record<string, string>> {
  const { rows } = await withAdmin((client) =>
    client.query<{ plate_number: string; verification_status: string }>(
      "SELECT plate_number, verification_status FROM verified_plates",
    ),
  );
  return Object.fromEntries(rows.map((r) => [r.plate_number, r.verification_status]));
}

describe("scripts/prune-claims.mjs", () => {
  beforeEach(migrateFresh);

  it("lässt nur alte Claims ohne Foto verfallen", async () => {
    const owner = await seedUser("user-owner", "owner@example.com");
    await seedPlate(owner, "KA-AB-1", { createdAt: daysAgo(8) });
    await seedPlate(owner, "KA-AB-2", { createdAt: daysAgo(6) });
    await seedPlate(owner, "KA-AB-3", { createdAt: daysAgo(8), proofPath: "user-owner/a.jpg" });
    await seedPlate(owner, "KA-AB-4", { createdAt: daysAgo(30), status: "rejected" });
    await seedPlate(owner, "KA-AB-5", {
      createdAt: daysAgo(30),
      verified: true,
      status: "approved",
    });

    await runPrune();

    expect(await statuses()).toEqual({
      "KA-AB-1": "expired",
      "KA-AB-2": "pending",
      "KA-AB-3": "pending",
      "KA-AB-4": "rejected",
      "KA-AB-5": "approved",
    });
  });
});
