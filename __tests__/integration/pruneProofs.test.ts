import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ADMIN_URL, migrateFresh, seedPlate, seedUser } from "./helpers/db";

const execFileAsync = promisify(execFile);

const OWNER = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";

let proofsDir: string;

async function withProofFile(userId: string, name: string): Promise<string> {
  await mkdir(join(proofsDir, userId), { recursive: true });
  await writeFile(join(proofsDir, userId, name), "bild");
  return `${userId}/${name}`;
}

async function filesOnDisk(): Promise<string[]> {
  const found: string[] = [];
  for (const dir of await readdir(proofsDir)) {
    for (const file of await readdir(join(proofsDir, dir))) found.push(`${dir}/${file}`);
  }
  return found.sort();
}

function runPrune(args: string[] = []) {
  return execFileAsync("node", ["scripts/prune-proofs.mjs", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_ADMIN_URL: ADMIN_URL, PROOFS_DIR: proofsDir },
  });
}

beforeEach(async () => {
  proofsDir = await mkdtemp(join(tmpdir(), "platedrop-prune-"));
  await migrateFresh();
});

describe("scripts/prune-proofs.mjs", () => {
  it("meldet verwaiste Dateien, ohne sie anzufassen", async () => {
    await seedUser(OWNER, "owner@example.com");
    const referenced = await withProofFile(OWNER, "aktuell.jpg");
    await seedPlate(OWNER, "KA-AB-1234", { proofPath: referenced });
    await withProofFile(OWNER, "verwaist.jpg");

    const { stdout } = await runPrune();

    expect(stdout).toContain("verwaist.jpg");
    expect(stdout).toContain("--delete");
    // Ohne --delete darf nichts verschwinden.
    expect(await filesOnDisk()).toEqual([`${OWNER}/aktuell.jpg`, `${OWNER}/verwaist.jpg`]);
  });

  it("löscht mit --delete nur die verwaisten Dateien", async () => {
    await seedUser(OWNER, "owner@example.com");
    const referenced = await withProofFile(OWNER, "aktuell.jpg");
    await seedPlate(OWNER, "KA-AB-1234", { proofPath: referenced });
    await withProofFile(OWNER, "verwaist.jpg");

    await runPrune(["--delete"]);

    expect(await filesOnDisk()).toEqual([`${OWNER}/aktuell.jpg`]);
  });

  it("räumt die Dateien eines gelöschten Kontos ab", async () => {
    // Genau der Fall aus der Löschprozedur: Die Kaskade entfernt die Zeile,
    // das Dateisystem erreicht sie nicht.
    await seedUser(OTHER, "weg@example.com");
    await withProofFile(OTHER, "verlassen.jpg");

    await runPrune(["--delete"]);

    expect(await filesOnDisk()).toEqual([]);
  });

  it("lässt referenzierte Dateien auch bei mehreren Nutzern in Ruhe", async () => {
    await seedUser(OWNER, "owner@example.com");
    await seedUser(OTHER, "zweiter@example.com");
    const a = await withProofFile(OWNER, "a.jpg");
    const b = await withProofFile(OTHER, "b.jpg");
    await seedPlate(OWNER, "KA-AB-1234", { proofPath: a });
    await seedPlate(OTHER, "M-XY-9999", { proofPath: b });

    await runPrune(["--delete"]);

    expect(await filesOnDisk()).toEqual([`${OWNER}/a.jpg`, `${OTHER}/b.jpg`].sort());
  });

  it("meldet nichts zu tun, wenn alles referenziert ist", async () => {
    await seedUser(OWNER, "owner@example.com");
    const a = await withProofFile(OWNER, "a.jpg");
    await seedPlate(OWNER, "KA-AB-1234", { proofPath: a });

    const { stdout } = await runPrune();

    expect(stdout).toContain("keine verwaisten Dateien");
  });
});
