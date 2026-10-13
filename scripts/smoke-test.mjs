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
    // Wie die App (src/app/auth/actions.ts): ohne Namen, er ist der Anzeigename.
    body: JSON.stringify({ name: "", email, password: PASSWORD }),
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

/**
 * Ruft eine Server Action so auf, wie es der Browser tut. Die Action-ID steht im
 * Manifest des laufenden Containers (`.next/dev/…` im Dev-, `.next/…` im
 * Produktionsmodus); die Seite muss vorher einmal abgerufen worden sein, damit
 * der Dev-Server sie kompiliert hat.
 *
 * Argumente werden wie bei Reacts `encodeReply` kodiert: das Wurzelmodell als
 * JSON im Feld "0", ein FormData-Argument als `$K<n>` mit Feldern `_<n>_<name>`.
 * Nur für den Rauchtest; ändert React das Format, schlägt dieser Schritt fehl.
 */
async function callAction(worker, exportedName, pagePath, cookie, args) {
  const { stdout } = await execFileAsync("docker", [
    "compose",
    "exec",
    "-T",
    "web",
    "sh",
    "-c",
    "cat .next/dev/server/server-reference-manifest.json 2>/dev/null || cat .next/server/server-reference-manifest.json",
  ]);
  const manifest = JSON.parse(stdout);
  const actionId = Object.entries(manifest.node).find(
    ([, entry]) => entry.exportedName === exportedName && worker in entry.workers,
  )?.[0];
  if (!actionId) throw new Error(`Action ${exportedName} nicht im Manifest`);

  const body = new FormData();
  const model = args.map((arg, index) => {
    if (arg === null || typeof arg === "string") return arg;
    const ref = index + 1;
    for (const [name, value] of Object.entries(arg)) {
      if (value instanceof Blob) body.append(`_${ref}_${name}`, value, "foto.jpg");
      else body.append(`_${ref}_${name}`, value);
    }
    return `$K${ref}`;
  });
  body.append("0", JSON.stringify(model));

  const response = await fetch(`${APP_URL}${pagePath}`, {
    method: "POST",
    headers: { cookie, Origin: APP_URL, "Next-Action": actionId, Accept: "text/x-component" },
    body,
  });
  return { status: response.status, body: await response.text() };
}

// --- Ablauf -----------------------------------------------------------------

async function main() {
  // Reste eines abgebrochenen Laufs, sonst kollidieren die festen Codes unten.
  await pool.query("DELETE FROM users WHERE email LIKE 'smoke-%@example.test'");
  await pool.query("DELETE FROM organizations WHERE slug LIKE 'smoke-%'");

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
  // Zahl 1000–9999: ohne führende Null, sonst greift die Formatprüfung (0008).
  const plateNumber = `KA-SM-${1000 + (STAMP % 9000)}`;
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

  step("6b) Upload über die echte Server Action");
  // ~2 MB, also über dem 1-MB-Standardlimit von Next für Server Actions. Die
  // Typerkennung prüft nur die JPEG-Signatur am Anfang.
  const uploadPlate = await pool.query(
    `INSERT INTO verified_plates (user_id, plate_number, verification_code)
     VALUES ($1, $2, 'PD-SMUP') RETURNING id`,
    [ownerId, `KA-SU-${1000 + (STAMP % 9000)}`],
  );
  const uploadPlateId = uploadPlate.rows[0].id;
  const jpeg = new Uint8Array(2 * 1024 * 1024);
  jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
  const upload = await callAction("app/dashboard/page", "uploadProof", "/dashboard", cookies, [
    uploadPlateId,
    { proof: new Blob([jpeg], { type: "image/jpeg" }) },
  ]);
  check("Upload-Action antwortet mit 200", upload.status === 200, `Status ${upload.status}`);
  check(
    "Upload-Action meldet Erfolg",
    upload.body.includes('"success":true'),
    upload.body.slice(0, 200),
  );
  const uploaded = await pool.query(
    "SELECT proof_image_url, verification_status FROM verified_plates WHERE id = $1",
    [uploadPlateId],
  );
  check(
    "Foto ist hinterlegt und wartet auf Prüfung",
    uploaded.rows[0]?.proof_image_url?.endsWith(".jpg") &&
      uploaded.rows[0]?.verification_status === "pending",
    JSON.stringify(uploaded.rows[0]),
  );

  const remove = await callAction("app/dashboard/page", "removePlate", "/dashboard", cookies, [
    uploadPlateId,
  ]);
  check(
    "Entfernen-Action meldet Erfolg",
    remove.body.includes('"success":true'),
    remove.body.slice(0, 200),
  );
  const afterRemove = await pool.query("SELECT 1 FROM verified_plates WHERE id = $1", [
    uploadPlateId,
  ]);
  check("Kennzeichen ist entfernt", afterRemove.rowCount === 0);
  const { stdout: leftover } = await execFileAsync("docker", [
    "compose",
    "exec",
    "-T",
    "web",
    "sh",
    "-c",
    `ls /data/proofs/${ownerId} | grep -c ${uploadPlateId} || true`,
  ]);
  check("Beweisfoto des entfernten Kennzeichens ist gelöscht", leftover.trim() === "0", leftover);

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

  step("9) Melden und Abhilfe durch den Admin");
  await pool.query(
    "UPDATE verified_plates SET is_verified = true, verification_status = 'approved' WHERE id = $1",
    [plateId],
  );
  const reported = await pool.query(
    "INSERT INTO messages (plate_number, message_text) VALUES ($1, $2) RETURNING id",
    [plateNumber, `Smoke-Meldung ${STAMP}`],
  );
  const reportedId = reported.rows[0].id;
  // Die Seite einmal abrufen, damit der Dev-Server die Actions kompiliert.
  await fetch(`${APP_URL}/dashboard`, { headers: { cookie: cookies } });
  const report = await callAction(
    "app/dashboard/page",
    "reportMessageAction",
    "/dashboard",
    cookies,
    [reportedId, "Beleidigung"],
  );
  check("Melden meldet Erfolg", report.body.includes('"success":true'), report.body.slice(0, 200));
  const dashboardAfterReport = await (
    await fetch(`${APP_URL}/dashboard`, { headers: { cookie: cookies } })
  ).text();
  check(
    "Gemeldete Nachricht ist für den Empfänger ausgeblendet",
    !dashboardAfterReport.includes(`Smoke-Meldung ${STAMP}`),
  );

  await pool.query("UPDATE users SET is_admin = true WHERE email = $1", [STRANGER_EMAIL]);
  const adminReports = await (
    await fetch(`${APP_URL}/admin`, { headers: { cookie: strangerCookies } })
  ).text();
  check("Admin sieht die gemeldete Nachricht", adminReports.includes(`Smoke-Meldung ${STAMP}`));
  const removal = await callAction(
    "app/admin/page",
    "deleteReportedMessageAction",
    "/admin",
    strangerCookies,
    [reportedId],
  );
  check(
    "Löschen meldet Erfolg",
    removal.body.includes('"success":true'),
    removal.body.slice(0, 200),
  );
  const afterRemoval = await pool.query("SELECT 1 FROM messages WHERE id = $1", [reportedId]);
  check("Gemeldete Nachricht ist gelöscht", afterRemoval.rowCount === 0);

  step("10) Anonyme Nachricht löst eine E-Mail aus");
  await fetch(`${MAILPIT_API}/messages`, { method: "DELETE" });
  await fetch(APP_URL); // Startseite kompilieren lassen (Dev-Server)
  const drop = await callAction("app/page", "dropMessage", "/", "", [
    null,
    { plateNumber: plateNumber, messageType: "licht_an" },
  ]);
  check("Nachricht angenommen", drop.body.includes('"success":true'), drop.body.slice(0, 200));
  const notification = await mailFor(OWNER_EMAIL);
  check("Benachrichtigung zugestellt", notification !== null);
  check(
    "Betreff nennt das Kennzeichen",
    notification?.Subject === `PlateDrop: Nachricht für ${plateNumber}`,
    notification?.Subject,
  );
  check(
    "Mail nennt nur den Nachrichtentyp",
    (notification?.Text ?? "").includes("Am Fahrzeug brennt noch Licht."),
  );
  const health = await (await fetch(`${APP_URL}/api/health`)).json();
  check("Healthcheck meldet den Outbox-Rückstand", typeof health.outboxLagSeconds === "number");

  step("11) Organisation: Beitritt, Freigabe, Nachricht über den Standort-QR");
  const slug = `smoke-${STAMP}`;
  const { stdout: created } = await execFileAsync("docker", [
    "compose",
    "run",
    "--rm",
    "-T",
    "migrate",
    "node",
    "scripts/create-org.mjs",
    "--name",
    "Smoke GmbH",
    "--slug",
    slug,
    "--site",
    "Smoke-Tiefgarage",
    "--admin",
    STRANGER_EMAIL,
  ]);
  const siteToken = created.match(/\/s\/([A-Za-z0-9_-]{22})/)?.[1];
  check("Organisation per Skript angelegt", Boolean(siteToken), created);
  const org = await pool.query(
    "SELECT o.id AS org_id, s.id AS site_id FROM organizations o JOIN org_sites s ON s.org_id = o.id WHERE o.slug = $1",
    [slug],
  );
  const { org_id: orgId, site_id: siteId } = org.rows[0] ?? {};

  const sitePage = await fetch(`${APP_URL}/s/${siteToken}`, { headers: { cookie: cookies } });
  check("Standort-Seite liefert 200", sitePage.status === 200, `Status ${sitePage.status}`);
  const joined = await callAction("app/s/[token]/page", "joinSite", `/s/${siteToken}`, cookies, [
    siteToken,
  ]);
  check("Beitritt beantragt", joined.body.includes('"success":true'), joined.body.slice(0, 200));

  const adminPath = `/o/${slug}/admin`;
  const adminView = await (
    await fetch(`${APP_URL}${adminPath}`, { headers: { cookie: strangerCookies } })
  ).text();
  check("Org-Admin sieht den Antrag", adminView.includes(OWNER_EMAIL));
  const ownerAdminView = await fetch(`${APP_URL}${adminPath}`, {
    headers: { cookie: cookies },
    redirect: "manual",
  });
  check(
    "Verwaltung für Nicht-Admin: 404",
    ownerAdminView.status === 404,
    `Status ${ownerAdminView.status}`,
  );
  const approvedMember = await callAction(
    "app/o/[slug]/admin/page",
    "approveMemberAction",
    adminPath,
    strangerCookies,
    [slug, siteId, ownerId],
  );
  check(
    "Mitgliedschaft bestätigt",
    approvedMember.body.includes('"success":true'),
    approvedMember.body.slice(0, 200),
  );

  const orgPlateNumber = `KA-OG-${1000 + (STAMP % 9000)}`;
  await fetch(`${APP_URL}/dashboard`, { headers: { cookie: cookies } });
  const orgClaim = await callAction("app/dashboard/page", "claimOrgPlate", "/dashboard", cookies, [
    null,
    { plateNumber: orgPlateNumber, orgId },
  ]);
  check(
    "Org-Kennzeichen beansprucht",
    orgClaim.body.includes('"success":true'),
    orgClaim.body.slice(0, 200),
  );
  const orgPlate = await pool.query(
    "SELECT id FROM verified_plates WHERE org_id = $1 AND plate_number = $2",
    [orgId, orgPlateNumber],
  );
  const decided = await callAction(
    "app/o/[slug]/admin/page",
    "decidePlateAction",
    adminPath,
    strangerCookies,
    [slug, orgPlate.rows[0]?.id, true],
  );
  check(
    "Org-Admin gibt das Kennzeichen frei",
    decided.body.includes('"success":true'),
    decided.body.slice(0, 200),
  );

  await fetch(`${MAILPIT_API}/messages`, { method: "DELETE" });
  const siteDrop = await callAction(
    "app/s/[token]/page",
    "dropSiteMessage",
    `/s/${siteToken}`,
    "",
    [null, { token: siteToken, plateNumber: orgPlateNumber, messageType: "blockiert" }],
  );
  check(
    "Besucher-Nachricht angenommen",
    siteDrop.body.includes('"success":true'),
    siteDrop.body.slice(0, 200),
  );
  const siteMail = await mailFor(OWNER_EMAIL);
  check(
    "Benachrichtigung für das Org-Kennzeichen",
    siteMail?.Subject === `PlateDrop: Nachricht für ${orgPlateNumber}`,
    siteMail?.Subject,
  );
  const ownerDashboard = await (
    await fetch(`${APP_URL}/dashboard`, { headers: { cookie: cookies } })
  ).text();
  check("Dashboard zeigt den Standort zur Nachricht", ownerDashboard.includes("Smoke-Tiefgarage"));

  const aushang = await fetch(`${APP_URL}${adminPath}/sites/${siteId}/aushang`, {
    headers: { cookie: strangerCookies },
  });
  const aushangHtml = await aushang.text();
  check(
    "Aushang mit QR-Code",
    aushang.status === 200 && aushangHtml.includes("<svg"),
    `Status ${aushang.status}`,
  );
  check("Aushang nennt die Standort-URL", aushangHtml.includes(`/s/${siteToken}`));

  // --- Aufräumen ------------------------------------------------------------
  await pool.query("DELETE FROM organizations WHERE slug = $1", [slug]);
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
