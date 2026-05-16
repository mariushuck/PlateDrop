import { normalizePlate, validateGermanPlate } from "@/lib/utils/plateUtils";

describe("normalizePlate", () => {
  it("removes hyphens and spaces and uppercases the plate", () => {
    expect(normalizePlate("ka-ab-1234")).toBe("KAAB1234");
    expect(normalizePlate("B MW 123")).toBe("BMW123");
  });

  it("collapses multiple spaces and mixed separators", () => {
    expect(normalizePlate("  ka   -  ab  - 123  ")).toBe("KAAB123");
    expect(normalizePlate("ka--ab   123")).toBe("KAAB123");
  });

  it("handles weird hyphen characters by leaving non-standard separators untouched", () => {
    expect(normalizePlate("ka–ab—1234")).toBe("KA–AB—1234");
  });

  it("returns empty string for empty input", () => {
    expect(normalizePlate("")).toBe("");
  });
});

describe("validateGermanPlate", () => {
  it("accepts standard German plate formats", () => {
    expect(validateGermanPlate("KA-AB-1234")).toBe(true);
    expect(validateGermanPlate("B MW 123")).toBe(true);
  });

  it("accepts lowercase input after normalization", () => {
    expect(validateGermanPlate("ka-ab-1234")).toBe(true);
    expect(validateGermanPlate("b mw 123")).toBe(true);
  });

  it("accepts e-plates and h-plates", () => {
    expect(validateGermanPlate("KA-AB-123E")).toBe(true);
    expect(validateGermanPlate("M-AB-123H")).toBe(true);
  });

  it("accepts compact formats that normalize to valid plates", () => {
    expect(validateGermanPlate("KAAB1234")).toBe(true);
    expect(validateGermanPlate("BMW123")).toBe(true);
  });

  it("rejects invalid strings and injection attempts", () => {
    expect(validateGermanPlate("DROP TABLE messages;")).toBe(false);
    expect(validateGermanPlate("' OR '1'='1")).toBe(false);
    expect(validateGermanPlate("🚗🚗🚗")).toBe(false);
    expect(validateGermanPlate("not-a-plate")).toBe(false);
  });

  it("rejects obviously malformed plates", () => {
    expect(validateGermanPlate("1234-AB-KA")).toBe(false);
    expect(validateGermanPlate("A")).toBe(false);
    expect(validateGermanPlate("KAABCD1234")).toBe(false);
  });
});
