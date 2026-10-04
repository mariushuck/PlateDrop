/**
 * @jest-environment node
 */
const headerValues = new Map<string, string>();

jest.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => headerValues.get(name.toLowerCase()) ?? null,
  }),
}));

type RateLimit = typeof import("@/lib/utils/rateLimit");

async function load(hops?: string): Promise<RateLimit> {
  if (hops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
  else process.env.TRUSTED_PROXY_HOPS = hops;
  jest.resetModules();
  return import("@/lib/utils/rateLimit");
}

beforeEach(() => headerValues.clear());

describe("getClientIp – Trusted-Proxy-Hops", () => {
  it("nimmt bei einem Hop (Standard) den letzten X-Forwarded-For-Eintrag", async () => {
    const { getClientIp } = await load();
    headerValues.set("x-forwarded-for", "9.9.9.9, 203.0.113.7");

    await expect(getClientIp()).resolves.toBe("203.0.113.7");
  });

  it("ignoriert einen vom Client gefälschten vorderen Eintrag", async () => {
    const { getClientIp } = await load("1");
    headerValues.set("x-forwarded-for", "1.2.3.4");

    await expect(getClientIp()).resolves.toBe("1.2.3.4");
  });

  it("nimmt bei zwei Hops den vorletzten Eintrag", async () => {
    const { getClientIp } = await load("2");
    headerValues.set("x-forwarded-for", "5.5.5.5, 203.0.113.7, 10.0.0.1");

    await expect(getClientIp()).resolves.toBe("203.0.113.7");
  });

  it("vertraut X-Forwarded-For bei 0 Hops gar nicht", async () => {
    const { getClientIp } = await load("0");
    headerValues.set("x-forwarded-for", "203.0.113.7");

    await expect(getClientIp()).resolves.toBeNull();
  });

  it("gibt null zurück, wenn mehr Hops erwartet als Einträge da sind", async () => {
    const { getClientIp } = await load("2");
    headerValues.set("x-forwarded-for", "203.0.113.7");

    await expect(getClientIp()).resolves.toBeNull();
  });
});
