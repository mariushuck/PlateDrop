import { generateVerificationCode } from "@/lib/utils/verificationCode";

describe("generateVerificationCode", () => {
  it("hat das Format XX-XXXX aus dem eindeutigen Alphabet", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateVerificationCode()).toMatch(/^[A-HJ-NP-Z2-9]{2}-[A-HJ-NP-Z2-9]{4}$/);
    }
  });

  it("verwendet nie die verwechselbaren Zeichen 0 O 1 I", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateVerificationCode()).not.toMatch(/[0O1I]/);
    }
  });

  it("erzeugt über viele Aufrufe praktisch nur unterschiedliche Codes", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateVerificationCode());
    // 32^6 ≈ 1,07 Mrd. Möglichkeiten – bei 1000 Ziehungen sind Kollisionen
    // extrem unwahrscheinlich.
    expect(seen.size).toBeGreaterThan(995);
  });
});
