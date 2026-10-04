import { APP_URL, clearMailbox, migrateFresh, withAdmin } from "./helpers/db";

/**
 * Zwei Härtungen der better-auth-Konfiguration (src/lib/auth/server.ts),
 * geprüft gegen echtes Postgres und Mailpit:
 *
 * - Ein Passwort-Reset beendet alle bestehenden Sitzungen. Sonst behielte
 *   jemand, der eine Sitzung übernommen hat, den Zugang auch nachdem das Opfer
 *   sein Passwort zurückgesetzt hat.
 * - `POST /api/auth/delete-user` ist über HTTP gesperrt. better-auth verlangt
 *   dort bei einer frischen Sitzung kein Passwort; gelöscht wird nur über die
 *   Server Action, die das Passwort prüft.
 */
type AuthModule = typeof import("@/lib/auth/server");
type DbContext = typeof import("@/lib/db/context");

const BASE_URL = "http://localhost:3000";
const EMAIL = "halter@example.com";
const PASSWORD = "erstes-sicheres-passwort";

let context: DbContext | null = null;

async function loadAuth(): Promise<AuthModule["auth"]> {
  process.env.DATABASE_URL = APP_URL;
  process.env.DATABASE_POOL_MAX = "4";
  process.env.BETTER_AUTH_URL = BASE_URL;
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-1234";
  process.env.SMTP_HOST = "localhost";
  process.env.SMTP_PORT = "51025";
  process.env.SMTP_SECURE = "false";
  process.env.MAIL_FROM = "PlateDrop <noreply@platedrop.test>";
  jest.resetModules();
  context = await import("@/lib/db/context");
  return (await import("@/lib/auth/server")).auth;
}

afterEach(async () => {
  await context?.closePool();
  context = null;
});

/** Registriert, bestätigt per SQL und meldet an. Liefert den Cookie-Header. */
async function signedInUser(auth: AuthModule["auth"]): Promise<{ userId: string; cookie: string }> {
  await auth.api.signUpEmail({ body: { email: EMAIL, password: PASSWORD, name: EMAIL } });
  await withAdmin((client) =>
    client.query(`UPDATE users SET "emailVerified" = true WHERE email = $1`, [EMAIL]),
  );

  const { headers, response } = await auth.api.signInEmail({
    body: { email: EMAIL, password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { userId: response.user.id, cookie };
}

async function sessionCount(userId: string): Promise<number> {
  const { rows } = await withAdmin((client) =>
    client.query<{ n: number }>(`SELECT count(*)::int AS n FROM sessions WHERE "userId" = $1`, [
      userId,
    ]),
  );
  return rows[0].n;
}

async function userExists(userId: string): Promise<boolean> {
  const { rowCount } = await withAdmin((client) =>
    client.query("SELECT 1 FROM users WHERE id = $1", [userId]),
  );
  return (rowCount ?? 0) > 0;
}

describe("better-auth-Härtung", () => {
  beforeEach(async () => {
    await migrateFresh();
    await clearMailbox();
  });

  it("beendet beim Passwort-Reset alle bestehenden Sitzungen", async () => {
    const auth = await loadAuth();
    const { userId } = await signedInUser(auth);
    expect(await sessionCount(userId)).toBe(1);

    await auth.api.requestPasswordReset({ body: { email: EMAIL, redirectTo: "/reset-password" } });
    const { rows } = await withAdmin((client) =>
      client.query<{ identifier: string }>(
        "SELECT identifier FROM verifications WHERE identifier LIKE 'reset-password:%'",
      ),
    );
    const token = rows[0].identifier.slice("reset-password:".length);

    await auth.api.resetPassword({ body: { token, newPassword: "zweites-sicheres-passwort" } });

    expect(await sessionCount(userId)).toBe(0);
  });

  it("sperrt die Kontolöschung über HTTP, auch mit frischer Sitzung", async () => {
    const auth = await loadAuth();
    const { userId, cookie } = await signedInUser(auth);

    const response = await auth.handler(
      new Request(`${BASE_URL}/api/auth/delete-user`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE_URL, cookie },
        body: "{}",
      }),
    );

    expect(response.status).toBe(404);
    expect(await userExists(userId)).toBe(true);
  });

  it("löscht serverseitig weiterhin, wenn das Passwort stimmt", async () => {
    const auth = await loadAuth();
    const { userId, cookie } = await signedInUser(auth);

    await auth.api.deleteUser({ body: { password: PASSWORD }, headers: new Headers({ cookie }) });

    expect(await userExists(userId)).toBe(false);
  });
});
