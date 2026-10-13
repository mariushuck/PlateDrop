import { safeNextPath } from "@/lib/auth/nextPath";

describe("safeNextPath", () => {
  it("erlaubt die Rückkehr zu einem Standort-Formular", () => {
    expect(safeNextPath(`/s/${"a".repeat(22)}`)).toBe(`/s/${"a".repeat(22)}`);
  });

  it.each([
    "https://evil.example/s/aaaaaaaaaaaaaaaaaaaaaa",
    "//evil.example",
    "/dashboard/../admin",
    `/s/${"a".repeat(22)}/../../admin`,
    "/s/kurz",
    null,
    undefined,
  ])("weist %p ab", (value) => {
    expect(safeNextPath(value)).toBe("/dashboard");
  });
});
