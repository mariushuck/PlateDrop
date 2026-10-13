import { generateSiteToken, SITE_TOKEN_PATTERN } from "@/lib/tags/token";

describe("Standort-Token", () => {
  it("hat 22 Zeichen base64url und wiederholt sich nicht", () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateSiteToken));
    expect(tokens.size).toBe(1000);
    for (const token of tokens) expect(token).toMatch(SITE_TOKEN_PATTERN);
  });
});
