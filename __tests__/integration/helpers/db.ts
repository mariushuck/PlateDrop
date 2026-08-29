import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";

const execFileAsync = promisify(execFile);

export const ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ??
  "postgres://platedrop_owner:test@localhost:55432/platedrop_test";
export const APP_PASSWORD = "test-app-password";
export const APP_URL = ADMIN_URL.replace("platedrop_owner:test@", `platedrop_app:${APP_PASSWORD}@`);
export const MAILPIT_API = process.env.TEST_MAILPIT_API ?? "http://localhost:58025/api/v1";

/** Führt Anweisungen als Owner aus – umgeht RLS und dient dem Setup. */
export async function withAdmin<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Setzt die Datenbank auf null zurück und spielt alle Migrationen neu ein. */
export async function migrateFresh(): Promise<void> {
  await withAdmin(async (client) => {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("DROP SCHEMA IF EXISTS app CASCADE");
    await client.query("CREATE SCHEMA public");
  });
  await execFileAsync("node", ["scripts/migrate.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_ADMIN_URL: ADMIN_URL, APP_DB_PASSWORD: APP_PASSWORD },
  });
}

/** Legt einen Nutzer direkt per SQL an – better-auth ist dabei nicht im Spiel. */
export async function seedUser(id: string, email: string, isAdmin = false): Promise<string> {
  await withAdmin((client) =>
    client.query(
      `INSERT INTO users (id, name, email, "emailVerified", "updatedAt", is_admin)
       VALUES ($1, $2, $3, true, now(), $4)`,
      [id, email, email, isAdmin],
    ),
  );
  return id;
}

export async function seedPlate(
  userId: string,
  plate: string,
  opts: { verified?: boolean; status?: string; proofPath?: string | null } = {},
): Promise<string> {
  const { rows } = await withAdmin((client) =>
    client.query<{ id: string }>(
      `INSERT INTO verified_plates
         (user_id, plate_number, is_verified, verification_status, proof_image_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, plate, opts.verified ?? false, opts.status ?? "pending", opts.proofPath ?? null],
    ),
  );
  return rows[0].id;
}

export async function seedMessage(plate: string, text: string): Promise<void> {
  await withAdmin((client) =>
    client.query("INSERT INTO messages (plate_number, message_text) VALUES ($1, $2)", [
      plate,
      text,
    ]),
  );
}

export async function clearMailbox(): Promise<void> {
  await fetch(`${MAILPIT_API}/messages`, { method: "DELETE" });
}
