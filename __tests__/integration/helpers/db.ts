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
  opts: {
    verified?: boolean;
    status?: string;
    proofPath?: string | null;
    /** Zeitpunkt des Anspruchs; Standard: jetzt. */
    createdAt?: Date;
    /** Organisation (0014); Standard: öffentlich. */
    orgId?: string;
  } = {},
): Promise<string> {
  const { rows } = await withAdmin((client) =>
    client.query<{ id: string }>(
      `INSERT INTO verified_plates
         (user_id, plate_number, is_verified, verification_status, proof_image_url, created_at,
          org_id)
       VALUES ($1, $2, $3, $4, $5, coalesce($6, now()), $7) RETURNING id`,
      [
        userId,
        plate,
        opts.verified ?? false,
        opts.status ?? "pending",
        opts.proofPath ?? null,
        opts.createdAt ?? null,
        opts.orgId ?? null,
      ],
    ),
  );
  return rows[0].id;
}

export async function seedMessage(
  plate: string,
  text: string,
  createdAt?: Date,
  scope: { orgId?: string; siteId?: string } = {},
): Promise<void> {
  await withAdmin((client) =>
    client.query(
      `INSERT INTO messages (plate_number, message_text, created_at, org_id, site_id)
       VALUES ($1, $2, coalesce($3, now()), $4, $5)`,
      [plate, text, createdAt ?? null, scope.orgId ?? null, scope.siteId ?? null],
    ),
  );
}

/** Organisation mit einem Standort; Token im gültigen Format. */
export async function seedOrg(
  slug: string,
  opts: { showSender?: boolean; allowFreeText?: boolean } = {},
): Promise<{ orgId: string; siteId: string; token: string }> {
  return withAdmin(async (client) => {
    const org = await client.query<{ id: string }>(
      `INSERT INTO organizations (name, slug, show_sender, allow_free_text)
       VALUES ($1, $1, $2, $3) RETURNING id`,
      [slug, opts.showSender ?? false, opts.allowFreeText ?? false],
    );
    const orgId = org.rows[0].id;
    const token = `${slug}-token-0000000000000000`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 22);
    const site = await client.query<{ id: string }>(
      "INSERT INTO org_sites (org_id, name, token) VALUES ($1, $2, $3) RETURNING id",
      [orgId, `${slug}-standort`, token.padEnd(22, "x")],
    );
    return { orgId, siteId: site.rows[0].id, token: token.padEnd(22, "x") };
  });
}

/** Weiterer Standort einer Organisation. */
export async function seedSite(orgId: string, name: string): Promise<string> {
  const token = `${name}-0000000000000000000000`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 22);
  const { rows } = await withAdmin((client) =>
    client.query<{ id: string }>(
      "INSERT INTO org_sites (org_id, name, token) VALUES ($1, $2, $3) RETURNING id",
      [orgId, name, token],
    ),
  );
  return rows[0].id;
}

export async function seedMember(
  siteId: string,
  userId: string,
  status: "pending" | "active" = "active",
): Promise<void> {
  await withAdmin((client) =>
    client.query("INSERT INTO site_members (site_id, user_id, status) VALUES ($1, $2, $3)", [
      siteId,
      userId,
      status,
    ]),
  );
}

export async function seedOrgAdmin(orgId: string, userId: string): Promise<void> {
  await withAdmin((client) =>
    client.query("INSERT INTO org_admins (org_id, user_id) VALUES ($1, $2)", [orgId, userId]),
  );
}

/** Zeitpunkt vor `days` Tagen. */
export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function clearMailbox(): Promise<void> {
  await fetch(`${MAILPIT_API}/messages`, { method: "DELETE" });
}
