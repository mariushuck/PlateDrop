import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isMessageType, MESSAGE_TYPES } from "@/lib/messages/catalog";

describe("Nachrichtenkatalog", () => {
  it("listet dieselben Codes wie der CHECK in Migration 0013", () => {
    const sql = readFileSync(
      join(process.cwd(), "db/migrations/0013_message_types_and_notifications.sql"),
      "utf8",
    );
    const check = /messages_type_check[\s\S]*?IN \(([\s\S]*?)\)\)/.exec(sql)?.[1] ?? "";
    const codesInSql = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

    expect(codesInSql).toEqual(MESSAGE_TYPES.map((t) => t.code));
  });

  it("erkennt nur Codes aus dem Katalog", () => {
    expect(isMessageType("licht_an")).toBe(true);
    expect(isMessageType("freitext")).toBe(false);
    expect(isMessageType(undefined)).toBe(false);
  });

  it("hat eindeutige Codes und für jeden einen Text", () => {
    const codes = MESSAGE_TYPES.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const entry of MESSAGE_TYPES) expect(entry.text.length).toBeGreaterThan(0);
  });
});
