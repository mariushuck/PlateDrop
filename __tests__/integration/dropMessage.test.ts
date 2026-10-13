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
        messageType: "licht_an",
        // Freitext von anonymen Absendern wird ignoriert, nie gespeichert.
        messageText: "Eigener Text",
      }),
    );

    expect(result).toEqual({ success: true });

    const stored = await withAdmin((client) =>
      client.query<{ plate_number: string; message_type: string; message_text: string | null }>(
        "SELECT plate_number, message_type, message_text FROM messages",
      ),
    );
    // Gespeichert wird die kanonische Form mit Trennstrichen — dieselbe Form
    // landet auch beim Claim in verified_plates, sonst würde das Lesen später
    // nicht mehr treffen.
    expect(stored.rows).toEqual([
      { plate_number: "KA-AB-1234", message_type: "licht_an", message_text: null },
    ]);
  });

  it("weist eine mehrdeutige Eingabe ab, statt sie einem Kennzeichen zuzuordnen", async () => {
    const { dropMessage } = await loadActions();

    // KAAB1234 kann KA-AB-1234 oder KAA-B-1234 sein.
    const result = await dropMessage(
      null,
      form({ plateNumber: "KAAB1234", messageType: "licht_an" }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Ortskürzel und Buchstaben trennen");

    const stored = await withAdmin((client) => client.query("SELECT id FROM messages"));
    expect(stored.rows).toHaveLength(0);
  });

  it("weist ein ungültiges Kennzeichen ab, ohne zu speichern", async () => {
    const { dropMessage } = await loadActions();

    const result = await dropMessage(
      null,
      form({
        plateNumber: "kein-kennzeichen",
        messageType: "licht_an",
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Ungültiges deutsches Kennzeichen");

    const stored = await withAdmin((client) => client.query("SELECT id FROM messages"));
    expect(stored.rows).toHaveLength(0);
  });

  it("verlangt eine Nachricht aus dem Katalog", async () => {
    const { dropMessage } = await loadActions();

    const missing = await dropMessage(null, form({ plateNumber: "KA-AB-1234" }));
    const unknown = await dropMessage(
      null,
      form({ plateNumber: "KA-AB-1234", messageType: "freitext" }),
    );

    expect(missing).toEqual({ success: false, error: "Bitte wählen Sie eine Nachricht aus." });
    expect(unknown).toEqual({ success: false, error: "Bitte wählen Sie eine Nachricht aus." });
    const stored = await withAdmin((client) => client.query("SELECT id FROM messages"));
    expect(stored.rows).toHaveLength(0);
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
            messageType: "licht_an",
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
      await dropMessage(null, form({ plateNumber: `KA-AB-${1000 + i}`, messageType: "licht_an" }));
    }

    headerValues.set("x-forwarded-for", "198.51.100.4");
    const other = await dropMessage(
      null,
      form({
        plateNumber: "M-XY-9999",
        messageType: "licht_an",
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
          messageType: "licht_an",
        }),
      );
      expect(ok).toEqual({ success: true });
    }

    headerValues.set("x-forwarded-for", "203.0.113.200");
    const blocked = await dropMessage(
      null,
      form({
        plateNumber: "KA-AB-1234",
        messageType: "licht_an",
      }),
    );

    expect(blocked).toEqual({
      success: false,
      error: "Zu viele Anfragen. Bitte versuchen Sie es in einigen Minuten erneut.",
    });
  });
});
