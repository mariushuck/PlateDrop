import { requireEnv } from "@/lib/env";

describe("requireEnv", () => {
  const KEY = "PLATEDROP_TEST_ENV";

  afterEach(() => {
    delete process.env[KEY];
  });

  it("gibt den Wert zurück, wenn die Variable gesetzt ist", () => {
    process.env[KEY] = "wert";
    expect(requireEnv(KEY)).toBe("wert");
  });

  it("wirft, wenn die Variable fehlt", () => {
    delete process.env[KEY];
    expect(() => requireEnv(KEY)).toThrow(KEY);
  });

  it("wirft, wenn die Variable leer oder nur Leerraum ist", () => {
    process.env[KEY] = "   ";
    expect(() => requireEnv(KEY)).toThrow(KEY);
  });
});
