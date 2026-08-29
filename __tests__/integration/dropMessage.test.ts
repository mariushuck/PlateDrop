import { APP_URL, migrateFresh, withAdmin } from "./helpers/db";

/**
 * `next/headers` ist Framework-Request-Kontext und außerhalb eines echten
 * Requests nicht verfügbar. Das ist die einzige Stelle, die hier ersetzt wird —
 * Datenbank, Rate-Limit und Validierung laufen echt.
 */
const headerValues = new Map<string, string>();

jest.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => headerValues.get(name.toLowerCase()) ?? null,
  }),
}));

type Actions = typeof import("@/app/actions");
type DbContext = typeof import("@/lib/db/context");

let context: DbContext | null = null;

async function loadActions(): Promise<Actions> {
  process.env.DATABASE_URL = APP_URL;
  process.env.RATE_LIMIT_SALT = "test-salt";
  jest.resetModules();
  context = await import("@/lib/db/context");
  return import("@/app/actions");
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeEach(async () => {
  headerValues.clear();
  headerValues.set("x-forwarded-for", "203.0.113.7");
  await migrateFresh();
});

afterEach(async () => {
  await context?.closePool();
  context = null;
});

describe("dropMessage", () => {
  it("speichert eine Nachricht an ein gültiges Kennzeichen", async () => {
    const { dropMessage } = await loadActions();

    const result = await dropMessage(
      null,
      form({
        plateNumber: "ka ab 1234",
        messageText: "  Dein Licht ist an.  ",
      }),
    );

    expect(result).toEqual({ success: true });

    const stored = await withAdmin((client) =>
      client.query<{ plate_number: string; message_text: string }>(
        "SELECT plate_number, message_text FROM messages",
      ),
    );
    // normalizePlate entfernt Bindestriche und Leerzeichen und schreibt groß —
    // dieselbe Form landet auch beim Claim in verified_plates, sonst würde das
    // Lesen später nicht mehr treffen.
    expect(stored.rows).toEqual([{ plate_number: "KAAB1234", message_text: "Dein Licht ist an." }]);
  });

  it("weist ein ungültiges Kennzeichen ab, ohne zu speichern", async () => {
    const { dropMessage } = await loadActions();

    const result = await dropMessage(
      null,
      form({
        plateNumber: "kein-kennzeichen",
        messageText: "Hallo",
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Ungültiges deutsches Kennzeichen");

    const stored = await withAdmin((client) => client.query("SELECT id FROM messages"));
    expect(stored.rows).toHaveLength(0);
  });

  it("weist eine leere Nachricht ab", async () => {
    const { dropMessage } = await loadActions();

    const result = await dropMessage(null, form({ plateNumber: "KA-AB-1234", messageText: "   " }));

    expect(result).toEqual({ success: false, error: "Nachricht darf nicht leer sein." });
  });

  it("weist eine Nachricht über 500 Zeichen ab", async () => {
    const { dropMessage } = await loadActions();

    const result = await dropMessage(
      null,
      form({
        plateNumber: "KA-AB-1234",
        messageText: "x".repeat(501),
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("500 Zeichen");
  });

  it("bremst denselben Absender nach zehn Nachrichten pro Minute", async () => {
    const { dropMessage } = await loadActions();

    // Verschiedene Kennzeichen, damit der Deckel je Kennzeichen nicht greift.
    const results = [];
    for (let i = 0; i < 11; i++) {
      results.push(
        await dropMessage(
          null,
          form({
            plateNumber: `KA-AB-${1000 + i}`,
            messageText: `Nachricht ${i}`,
          }),
        ),
      );
    }

    expect(results.slice(0, 10).every((r) => r.success)).toBe(true);
    expect(results[10]).toEqual({
      success: false,
      error: "Zu viele Anfragen. Bitte versuchen Sie es in einigen Minuten erneut.",
    });
  });

  it("bremst verschiedene Absender unabhängig voneinander", async () => {
    const { dropMessage } = await loadActions();

    for (let i = 0; i < 11; i++) {
      await dropMessage(null, form({ plateNumber: `KA-AB-${1000 + i}`, messageText: "x" }));
    }

    headerValues.set("x-forwarded-for", "198.51.100.4");
    const other = await dropMessage(
      null,
      form({
        plateNumber: "M-XY-9999",
        messageText: "andere IP",
      }),
    );

    expect(other).toEqual({ success: true });
  });

  it("meldet das Kennzeichen-Limit als Rate-Limit-Fehler", async () => {
    const { dropMessage } = await loadActions();

    // Deckel je Kennzeichen ist 20/Stunde; das Absenderlimit umgehen wir,
    // indem jede Anfrage aus einer anderen IP kommt.
    for (let i = 0; i < 20; i++) {
      headerValues.set("x-forwarded-for", `203.0.113.${i + 1}`);
      const ok = await dropMessage(
        null,
        form({
          plateNumber: "KA-AB-1234",
          messageText: `Nachricht ${i}`,
        }),
      );
      expect(ok).toEqual({ success: true });
    }

    headerValues.set("x-forwarded-for", "203.0.113.200");
    const blocked = await dropMessage(
      null,
      form({
        plateNumber: "KA-AB-1234",
        messageText: "eine zu viel",
      }),
    );

    expect(blocked).toEqual({
      success: false,
      error: "Zu viele Anfragen. Bitte versuchen Sie es in einigen Minuten erneut.",
    });
  });
});
