import {
  backoffMs,
  berlinHour,
  inQuietHours,
  notificationMail,
  quietHoursEnd,
} from "../../scripts/lib/notify.mjs";

// 2026-10-13 12:30 UTC = 14:30 in Berlin (Sommerzeit, UTC+2).
const AFTERNOON = new Date("2026-10-13T12:30:00Z");
// 2026-10-13 21:30 UTC = 23:30 in Berlin.
const NIGHT = new Date("2026-10-13T21:30:00Z");

describe("Notifier: Ruhezeiten", () => {
  it("rechnet in Berliner Zeit", () => {
    expect(berlinHour(AFTERNOON)).toBe(14);
    expect(berlinHour(NIGHT)).toBe(23);
  });

  it("erkennt Ruhezeiten innerhalb eines Tages", () => {
    expect(inQuietHours(AFTERNOON, 13, 15)).toBe(true);
    expect(inQuietHours(AFTERNOON, 15, 18)).toBe(false);
  });

  it("erkennt Ruhezeiten über Mitternacht", () => {
    expect(inQuietHours(NIGHT, 22, 7)).toBe(true);
    expect(inQuietHours(AFTERNOON, 22, 7)).toBe(false);
  });

  it("kennt ohne Einstellung keine Ruhezeit", () => {
    expect(inQuietHours(NIGHT, null, null)).toBe(false);
  });

  it("verschiebt bis zur vollen Stunde, an der die Ruhezeit endet", () => {
    // 23:30 Berlin, Ende 7 Uhr → 07:00 Berlin = 05:00 UTC am Folgetag.
    expect(quietHoursEnd(NIGHT, 7).toISOString()).toBe("2026-10-14T05:00:00.000Z");
  });
});

describe("Notifier: Backoff und Mail", () => {
  it("verdoppelt die Wartezeit bis höchstens eine Stunde", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(20)).toBe(3_600_000);
  });

  it("nennt nur Typ und Kennzeichen und maskiert HTML", () => {
    const mail = notificationMail({
      plate: "KA-AB-1234",
      typeText: "Am Fahrzeug brennt noch Licht.",
      dashboardUrl: 'https://example.test/"><script>',
    });
    expect(mail.subject).toBe("PlateDrop: Nachricht für KA-AB-1234");
    expect(mail.text).toContain("Am Fahrzeug brennt noch Licht.");
    expect(mail.html).not.toContain("<script>");
  });
});
