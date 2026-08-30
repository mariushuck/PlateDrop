#!/usr/bin/env node
/**
 * Routine-Datenpflege in einem Aufruf – gedacht für einen täglichen Cron-Job:
 *
 *   docker compose run --rm migrate node scripts/maintenance.mjs
 *
 * Läuft alle Teilschritte nacheinander. Ein Fehlschlag wird gemeldet, stoppt
 * aber die übrigen Schritte nicht; der Exit-Code ist am Ende ungleich 0, wenn
 * mindestens einer fehlgeschlagen ist.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const STEPS = [
  ["prune-sessions.mjs", []],
  ["prune-throttle.mjs", []],
  ["prune-messages.mjs", []],
  ["prune-proofs.mjs", ["--delete"]],
];

function run(script, args) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [join(HERE, script), ...args], { stdio: "inherit" });
    child.on("close", (code) => resolvePromise(code ?? 1));
    child.on("error", () => resolvePromise(1));
  });
}

let failed = 0;
for (const [script, args] of STEPS) {
  console.log(`\n== ${script} ${args.join(" ")} ==`);
  const code = await run(script, args);
  if (code !== 0) {
    failed += 1;
    console.error(`${script} endete mit Code ${code}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} Schritt(e) fehlgeschlagen.`);
  process.exitCode = 1;
} else {
  console.log("\nDatenpflege abgeschlossen.");
}
