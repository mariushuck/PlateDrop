import districts from "@/lib/utils/districts.json";
import {
  districtName,
  EXAMPLE_PLATE,
  isCanonicalPlate,
  normalizePlate,
  parsePlate,
  validateGermanPlate,
} from "@/lib/utils/plateUtils";

describe("parsePlate", () => {
  it("bringt getrennte Eingaben in die kanonische Form ORT-BUCHSTABEN-ZAHL", () => {
    expect(parsePlate("KA-AB-1234")).toEqual({ ok: true, plate: "KA-AB-1234" });
    expect(parsePlate("ka ab 1234")).toEqual({ ok: true, plate: "KA-AB-1234" });
    expect(parsePlate("  ka   -  ab  - 123  ")).toEqual({ ok: true, plate: "KA-AB-123" });
    expect(parsePlate("ka--ab   123")).toEqual({ ok: true, plate: "KA-AB-123" });
  });

  it("braucht keine Trennung zwischen Buchstaben und Zahl", () => {
    expect(parsePlate("KA AB1234")).toEqual({ ok: true, plate: "KA-AB-1234" });
    expect(parsePlate("K-AB1234")).toEqual({ ok: true, plate: "K-AB-1234" });
  });

  // Der Kern des Fixes: ohne Trennung zwischen Ortskürzel und Buchstaben ist
  // "KAB1234" sowohl K-AB-1234 (Köln) als auch KA-B-1234 (Karlsruhe). Wer eines
  // davon verifiziert, dürfte nicht die Nachrichten an das andere lesen.
  it("hält K-AB-1234 und KA-B-1234 auseinander", () => {
    expect(normalizePlate("K-AB 1234")).toBe("K-AB-1234");
    expect(normalizePlate("KA-B 1234")).toBe("KA-B-1234");
  });

  it("bietet bei echter Mehrdeutigkeit beide Ortskürzel zur Wahl an", () => {
    // K (Köln) und KA (Karlsruhe) gibt es beide.
    expect(parsePlate("KAB1234")).toEqual({
      ok: false,
      reason: "ambiguous",
      candidates: [
        { plate: "K-AB-1234", district: "Köln" },
        { plate: "KA-B-1234", district: "Karlsruhe" },
      ],
    });
  });

  it("trennt Kompaktformen anhand der amtlichen Ortskürzel", () => {
    // KAA ist kein Ortskürzel, also bleibt nur KA-AB.
    expect(parsePlate("KAAB1234")).toEqual({ ok: true, plate: "KA-AB-1234" });
    expect(parsePlate("KAAB 1234")).toEqual({ ok: true, plate: "KA-AB-1234" });
    expect(parsePlate("BM123")).toEqual({ ok: true, plate: "B-M-123" });
    expect(parsePlate("smüab1")).toEqual({ ok: true, plate: "SMÜ-AB-1" });
  });

  it("lehnt unbekannte Ortskürzel ab", () => {
    expect(parsePlate("XX-AB-123")).toEqual({ ok: false, reason: "unknown-district" });
    expect(parsePlate("ABC-DE-12")).toEqual({ ok: false, reason: "unknown-district" });
    // Ohne Trennung gibt es dann keine gültige Aufteilung.
    expect(parsePlate("abcde12")).toEqual({ ok: false, reason: "invalid" });
  });

  it("akzeptiert Ortskürzel mit Umlaut", () => {
    expect(parsePlate("TÖL-AB-12")).toEqual({ ok: true, plate: "TÖL-AB-12" });
    expect(parsePlate("mü x 7")).toEqual({ ok: true, plate: "MÜ-X-7" });
  });

  it("lässt Umlaute nur im Ortskürzel zu", () => {
    expect(parsePlate("KA-ÄB-12").ok).toBe(false);
  });

  it("akzeptiert E- und H-Kennzeichen", () => {
    expect(parsePlate("KA-AB-123E")).toEqual({ ok: true, plate: "KA-AB-123E" });
    expect(parsePlate("m ab 123h")).toEqual({ ok: true, plate: "M-AB-123H" });
  });

  it("lehnt eine Zahl mit führender Null ab", () => {
    expect(parsePlate("KA-AB-0123")).toEqual({ ok: false, reason: "invalid" });
    expect(parsePlate("KA-AB-0")).toEqual({ ok: false, reason: "invalid" });
  });

  it("behandelt Gedankenstriche nicht als Trennzeichen", () => {
    expect(parsePlate("ka–ab—1234")).toEqual({ ok: false, reason: "invalid" });
  });

  it("lehnt Unsinn und Injection-Versuche ab", () => {
    for (const input of [
      "",
      "A",
      "DROP TABLE messages;",
      "' OR '1'='1",
      "🚗🚗🚗",
      "not-a-plate",
      "1234-AB-KA",
      "KAABCD1234",
      "KA-AB-12345",
      "KA-AB-CD-12",
    ]) {
      expect(parsePlate(input)).toEqual({ ok: false, reason: "invalid" });
    }
  });
});

describe("normalizePlate", () => {
  it("liefert die kanonische Form", () => {
    expect(normalizePlate("ka-ab-1234")).toBe("KA-AB-1234");
    expect(normalizePlate("B MW 123")).toBe("B-MW-123");
  });

  it("liefert einen Leerstring für ungültige und mehrdeutige Eingaben", () => {
    expect(normalizePlate("")).toBe("");
    expect(normalizePlate("not-a-plate")).toBe("");
    expect(normalizePlate("KAB1234")).toBe("");
  });
});

describe("validateGermanPlate", () => {
  it("akzeptiert eindeutige Kennzeichen", () => {
    expect(validateGermanPlate("KA-AB-1234")).toBe(true);
    expect(validateGermanPlate("b mw 123")).toBe(true);
  });

  it("lehnt mehrdeutige und ungültige Eingaben ab", () => {
    expect(validateGermanPlate("KAB1234")).toBe(false);
    expect(validateGermanPlate("DROP TABLE messages;")).toBe(false);
  });
});

describe("isCanonicalPlate", () => {
  it("erkennt die gespeicherte Form", () => {
    expect(isCanonicalPlate("KA-AB-1234")).toBe(true);
    expect(isCanonicalPlate("TÖL-AB-12H")).toBe(true);
  });

  it("erkennt Altdaten im Kompaktformat", () => {
    expect(isCanonicalPlate("KAAB1234")).toBe(false);
    expect(isCanonicalPlate("ka-ab-1234")).toBe(false);
  });
});

describe("Ortskürzel", () => {
  it("enthält die amtlichen Kürzel, auch mit Umlaut und auslaufende", () => {
    for (const code of ["KA", "K", "B", "M", "TÖL", "MÜ", "SMÜ", "AL"]) {
      expect(districts).toHaveProperty(code);
    }
    expect(districtName("KA")).toBe("Karlsruhe");
    expect(districtName("XX")).toBeUndefined();
  });

  it("zeigt als Beispiel ein Kennzeichen, das es nicht geben kann", () => {
    const [district] = EXAMPLE_PLATE.split("-");
    expect(districts).not.toHaveProperty(district);
    expect(parsePlate(EXAMPLE_PLATE)).toEqual({ ok: false, reason: "unknown-district" });
  });
});
