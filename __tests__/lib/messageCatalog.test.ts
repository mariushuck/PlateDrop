import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isMessageType,
  MESSAGE_CATEGORIES,
  MESSAGE_TYPES,
  messageEntries,
  parseMessageTypes,
} from "@/lib/messages/catalog";

describe("Nachrichtenkatalog", () => {
  it("listet dieselben Codes wie der CHECK in Migration 0015", () => {
    const sql = readFileSync(
      join(process.cwd(), "db/migrations/0015_message_type_list.sql"),
      "utf8",
    );
    const check = /messages_types_check[\s\S]*?ARRAY\[([\s\S]*?)\]/.exec(sql)?.[1] ?? "";
    const codesInSql = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

    expect(codesInSql).toEqual(MESSAGE_TYPES.map((t) => t.code));
  });

  it("erkennt nur Codes aus dem Katalog", () => {
    expect(isMessageType("licht_an")).toBe(true);
    expect(isMessageType("freitext")).toBe(false);
    expect(isMessageType(undefined)).toBe(false);
  });

  it("hat eindeutige Codes und für jeden Text, Kurzform und Kategorie", () => {
    const codes = MESSAGE_TYPES.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const entry of MESSAGE_TYPES) {
      expect(entry.text.length).toBeGreaterThan(0);
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.category.length).toBeGreaterThan(0);
    }
  });

  it("behält die Codes aus Migration 0013, damit alte Nachrichten lesbar bleiben", () => {
    for (const code of [
      "licht_an",
      "fenster_offen",
      "tuer_offen",
      "blockiert",
      "abschleppen",
      "alarm",
      "reifen",
      "schaden_gesehen",
      "danke",
    ]) {
      expect(isMessageType(code)).toBe(true);
    }
  });

  it("gruppiert jeden Eintrag genau einmal, Kategorien in Katalogreihenfolge", () => {
    const grouped = MESSAGE_CATEGORIES.flatMap((c) => c.types.map((t) => t.code));
    expect(grouped).toEqual(MESSAGE_TYPES.map((t) => t.code));
    for (const category of MESSAGE_CATEGORIES) {
      expect(category.types.every((t) => t.category === category.name)).toBe(true);
    }
  });

  it("liest die Auswahl aus dem Formular: ohne Dubletten, nur Katalog-Codes", () => {
    expect(parseMessageTypes(["licht_an", "alarm", "licht_an"])).toEqual(["licht_an", "alarm"]);
    expect(parseMessageTypes([])).toEqual([]);
    // Ein fremder Wert macht die ganze Auswahl ungültig – nichts wird still verworfen.
    expect(parseMessageTypes(["licht_an", "freitext"])).toBeNull();
    expect(parseMessageTypes([new File([], "x")])).toBeNull();
  });

  it("liefert gespeicherte Gründe dringliche zuerst und überspringt Unbekanntes", () => {
    expect(messageEntries(["reifen", "entfernt", "licht_an"]).map((e) => e.code)).toEqual([
      "licht_an",
      "reifen",
    ]);
    expect(messageEntries(null)).toEqual([]);
  });
});
