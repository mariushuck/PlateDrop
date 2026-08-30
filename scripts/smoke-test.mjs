#!/usr/bin/env node
/**
 * End-to-End-Rauchtest gegen den laufenden Stack.
 *
 *   docker compose up -d
 *   node scripts/smoke-test.mjs
 *
 * Deckt ab, was die Jest-Integrationstests nicht erreichen: better-auth über
 * HTTP gegen das migrierte Schema, den Mailversand und die Autorisierung der
 * Beweisfoto-Route. Legt eigene Testkonten an und räumt sie am Ende wieder ab.
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import pg from "pg";

const execFileAsync = promisify(execFile);

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const MAILPIT_API = process.env.MAILPIT_API ?? "http://localhost:8025/api/v1";
const STAMP = Date.now();

// better-auth weist zustandsändernde Requests ohne passenden Origin ab (CSRF-
// Schutz). Ein Browser setzt den Header selbst; hier müssen wir ihn mitgeben.
const JSON_HEADERS = { "Content-Type": "application/json", Origin: APP_URL };
const OWNER_EMAIL = `smoke-owner-${STAMP}@example.test`;
const STRANGER_EMAIL = `smoke-stranger-${STAMP}@example.test`;
const PASSWORD = "smoke-test-passwort";

// --- Hilfsmittel ------------------------------------------------------------

let failures = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.log(`  FEHLT ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function step(label) {
  console.log(`\n${label}`);
}

/** Liest DATABASE_ADMIN_URL aus .env und stellt sie auf localhost um. */
function adminUrlFromEnvFile() {
  const env = Object.fromEntries(
    readFileSync(".env", "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
  const url = env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL fehlt in .env");
  return url.replace("@db:5432", "@localhost:5432");
}

const pool = new pg.Pool({ connectionString: adminUrlFromEnvFile() });

async function mailFor(address) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(`${MAILPIT_API}/messages`);
    const { messages } = await response.json();
    const match = messages.find((m) => m.To.some((to) => to.Address === address));
    if (match) {
      const detail = await fetch(`${MAILPIT_API}/message/${match.ID}`);
      return { ...match, ...(await detail.json()) };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

function linkFrom(text) {
  return text.match(/https?:\/\/\S+/)?.[0]?.replace(/[).,]+$/, "") ?? null;
}

async function signUp(email) {
  return fetch(`${APP_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: email, email, password: PASSWORD }),
  });
}

async function signIn(email) {
  const response = await fetch(`${APP_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password: PASSWORD }),
    redirect: "manual",
  });
  const cookies = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { response, cookies };
}

// --- Ablauf -----------------------------------------------------------------

async function main() {
  step("0) Erreichbarkeit");
  const home = await fetch(APP_URL);
  check("Startseite liefert 200", home.status === 200, `Status ${home.status}`);

  step("1) Registrierung verschickt eine Bestätigungsmail");
  const signUpResponse = await signUp(OWNER_EMAIL);
  check("Registrierung akzeptiert", signUpResponse.ok, `Status ${signUpResponse.status}`);

  const verificationMail = await mailFor(OWNER_EMAIL);
  check("Bestätigungsmail zugestellt", verificationMail !== null);
  check(
    "Betreff der Bestätigungsmail stimmt",
    verificationMail?.Subject === "PlateDrop: E-Mail-Adresse bestätigen",
    verificationMail?.Subject,
  );

  step("2) Anmeldung ist vor der Bestätigung gesperrt");
  const earlySignIn = await signIn(OWNER_EMAIL);
  check(
    "Login ohne bestätigte Adresse abgelehnt",
    !earlySignIn.response.ok,
    `Status ${earlySignIn.response.status}`,
  );

  step("3) Bestätigungslink schaltet das Konto frei");
  const verifyLink = linkFrom(verificationMail?.Text ?? "");
  check("Link in der E-Mail gefunden", verifyLink !== null);
  const verifyResponse = await fetch(verifyLink, { redirect: "manual" });
  check(
    "Bestätigungslink akzeptiert",
    verifyResponse.status >= 200 && verifyResponse.status < 400,
    `Status ${verifyResponse.status}`,
  );

  const verified = await pool.query(
    'SELECT id, "emailVerified", is_admin FROM users WHERE email = $1',
    [OWNER_EMAIL],
  );
  check("Adresse ist in der Datenbank bestätigt", verified.rows[0]?.emailVerified === true);
  check("Neues Konto ist kein Admin", verified.rows[0]?.is_admin === false);
  const ownerId = verified.rows[0]?.id;

  step("4) Anmeldung setzt ein Session-Cookie");
  const { response: signInResponse, cookies } = await signIn(OWNER_EMAIL);
  check("Login erfolgreich", signInResponse.ok, `Status ${signInResponse.status}`);
  check("Session-Cookie gesetzt", cookies.length > 0);

  const session = await fetch(`${APP_URL}/api/auth/get-session`, { headers: { cookie: cookies } });
  const sessionBody = await session.json();
  check("Session gehört zum richtigen Konto", sessionBody?.user?.email === OWNER_EMAIL);

  step("5) Geschützte Seiten");
  const dashboardAnon = await fetch(`${APP_URL}/dashboard`, { redirect: "manual" });
  check(
    "Dashboard ohne Anmeldung leitet um",
    [302, 303, 307].includes(dashboardAnon.status),
    `Status ${dashboardAnon.status}`,
  );

  const dashboard = await fetch(`${APP_URL}/dashboard`, { headers: { cookie: cookies } });
  check(
    "Dashboard mit Anmeldung liefert 200",
    dashboard.status === 200,
    `Status ${dashboard.status}`,
  );

  const adminPage = await fetch(`${APP_URL}/admin`, {
    headers: { cookie: cookies },
    redirect: "manual",
  });
  check(
    "Admin-Bereich für Nicht-Admin gesperrt",
    [302, 303, 307].includes(adminPage.status),
    `Status ${adminPage.status}`,
  );

  step("6) Beweisfoto: Zugriff wird pro Abruf geprüft");
  // Zweites Konto als Fremder.
  await signUp(STRANGER_EMAIL);
  const strangerMail = await mailFor(STRANGER_EMAIL);
  await fetch(linkFrom(strangerMail.Text), { redirect: "manual" });
  const { cookies: strangerCookies } = await signIn(STRANGER_EMAIL);

  // Claim und Upload laufen über Server Actions; für den Rauchtest legen wir
  // Zeile und Datei direkt an und prüfen dann die Ausliefer-Route.
  const plateNumber = `KA-SM-${String(STAMP).slice(-4)}`;
  const plate = await pool.query(
    `INSERT INTO verified_plates (user_id, plate_number, verification_code)
     VALUES ($1, $2, 'PD-SMOK') RETURNING id`,
    [ownerId, plateNumber],
  );
  const plateId = plate.rows[0].id;
  const objectPath = `${ownerId}/${plateId}-${STAMP}.png`;
  // 1x1-PNG in das proofs-Volume des Containers schreiben.
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  await execFileAsync("docker", [
    "compose",
    "exec",
    "-T",
    "web",
    "sh",
    "-c",
    `mkdir -p /data/proofs/${ownerId} && echo '${pngBase64}' | base64 -d > /data/proofs/${objectPath}`,
  ]);
  await pool.query("UPDATE verified_plates SET proof_image_url = $1 WHERE id = $2", [
    objectPath,
    plateId,
  ]);

  const anonProof = await fetch(`${APP_URL}/api/proofs/${objectPath}`);
  check("Beweisfoto ohne Anmeldung: 401", anonProof.status === 401, `Status ${anonProof.status}`);

  const strangerProof = await fetch(`${APP_URL}/api/proofs/${objectPath}`, {
    headers: { cookie: strangerCookies },
  });
  check(
    "Beweisfoto für fremden Nutzer: 404",
    strangerProof.status === 404,
    `Status ${strangerProof.status}`,
  );

  const ownerProof = await fetch(`${APP_URL}/api/proofs/${objectPath}`, {
    headers: { cookie: cookies },
  });
  check("Beweisfoto für den Halter: 200", ownerProof.status === 200, `Status ${ownerProof.status}`);
  check(
    "Beweisfoto wird als Bild ausgeliefert",
    ownerProof.headers.get("content-type") === "image/png",
    ownerProof.headers.get("content-type") ?? "",
  );
  check(
    "Beweisfoto wird nicht zwischengespeichert",
    (ownerProof.headers.get("cache-control") ?? "").includes("no-store"),
    ownerProof.headers.get("cache-control") ?? "",
  );

  const traversal = await fetch(`${APP_URL}/api/proofs/${ownerId}/../../etc/passwd`, {
    headers: { cookie: cookies },
  });
  check(
    "Pfad-Ausbruch wird abgewiesen",
    traversal.status === 404 || traversal.status === 400,
    `Status ${traversal.status}`,
  );

  step("7) Passwort-Reset verschickt eine E-Mail mit Token");
  await fetch(`${MAILPIT_API}/messages`, { method: "DELETE" });
  await fetch(`${APP_URL}/api/auth/request-password-reset`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email: OWNER_EMAIL, redirectTo: "/reset-password" }),
  });
  const resetMail = await mailFor(OWNER_EMAIL);
  check("Reset-Mail zugestellt", resetMail !== null);
  check(
    "Betreff der Reset-Mail stimmt",
    resetMail?.Subject === "PlateDrop: Passwort zurücksetzen",
    resetMail?.Subject,
  );
  const resetLink = linkFrom(resetMail?.Text ?? "");
  const resetPage = await fetch(resetLink, { redirect: "follow" });
  check(
    "Reset-Link führt zur Formularseite",
    resetPage.status === 200,
    `Status ${resetPage.status}`,
  );
  check("Formularseite enthält das Token-Feld", (await resetPage.text()).includes('name="token"'));

  step("8) Eine Ablehnung führt nicht in die Sackgasse");
  // Der Halter muss ein abgelehntes Kennzeichen wiederfinden und ein neues Foto
  // nachreichen können. Die Query-Logik selbst deckt die Integrationssuite ab;
  // hier zählt, was der Halter und der Admin tatsächlich zu sehen bekommen.
  await pool.query("UPDATE verified_plates SET verification_status = 'rejected' WHERE id = $1", [
    plateId,
  ]);
  await pool.query("UPDATE users SET is_admin = true WHERE id = $1", [ownerId]);

  const rejectedView = await (
    await fetch(`${APP_URL}/dashboard`, { headers: { cookie: cookies } })
  ).text();
  check("Abgelehntes Kennzeichen erscheint im Dashboard", rejectedView.includes(plateNumber));
  check(
    "Der Halter sieht den Ablehnungs-Hinweis",
    rejectedView.includes("Die Prüfung war nicht erfolgreich"),
  );
  check("Das Upload-Feld steht wieder bereit", rejectedView.includes("Foto hochladen"));
  check(
    "Es steht nicht mehr fälschlich \u201Ewird geprüft\u201C da",
    !rejectedView.includes("Wird vom Admin geprüft"),
  );

  const adminBefore = await (
    await fetch(`${APP_URL}/admin`, { headers: { cookie: cookies } })
  ).text();
  check(
    "Abgelehntes Kennzeichen ist beim Admin nicht gelistet",
    !adminBefore.includes(plateNumber),
  );

  // Nachgereichtes Foto: derselbe Effekt, den setProofPath erzeugt.
  await pool.query(
    `UPDATE verified_plates
        SET proof_image_url = $1, verification_status = 'pending'
      WHERE id = $2`,
    [objectPath, plateId],
  );
  const adminAfter = await (
    await fetch(`${APP_URL}/admin`, { headers: { cookie: cookies } })
  ).text();
  check("Nach dem Nachreichen ist es beim Admin wieder gelistet", adminAfter.includes(plateNumber));

  // --- Aufräumen ------------------------------------------------------------
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[OWNER_EMAIL, STRANGER_EMAIL]]);
  await execFileAsync("docker", [
    "compose",
    "exec",
    "-T",
    "web",
    "sh",
    "-c",
    `rm -rf /data/proofs/${ownerId}`,
  ]);
  await fetch(`${MAILPIT_API}/messages`, { method: "DELETE" });
  await pool.end();

  console.log(
    failures === 0 ? "\nAlle Prüfungen bestanden." : `\n${failures} Prüfung(en) fehlgeschlagen.`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(async (error) => {
  console.error("\nRauchtest abgebrochen:", error.message);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
