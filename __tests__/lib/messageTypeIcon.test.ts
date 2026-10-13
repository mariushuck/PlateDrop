import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MESSAGE_TYPES } from "@/lib/messages/catalog";

describe("Symbole zum Nachrichtenkatalog", () => {
  it("hat für jeden Katalog-Eintrag ein Symbol", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/ui/MessageTypeIcon.tsx"),
      "utf8",
    );
    for (const type of MESSAGE_TYPES) {
      expect(source).toMatch(new RegExp(`["\\s]${type.icon}"?:`));
    }
  });
});
