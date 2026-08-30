import { emailChangeEmail, passwordResetEmail } from "@/lib/email/templates";

describe("E-Mail-Vorlagen: HTML-Maskierung", () => {
  it("maskiert eine bösartige neue E-Mail-Adresse im HTML-Teil", () => {
    const { html } = emailChangeEmail(
      "https://example.test/verify?token=abc",
      '"><script>alert(1)</script>',
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("maskiert Anführungszeichen in der URL, sodass das href-Attribut hält", () => {
    const { html } = passwordResetEmail('https://example.test/"><img src=x onerror=alert(1)>');

    expect(html).not.toContain('"><img');
    expect(html).toContain("&quot;&gt;&lt;img");
  });
});
