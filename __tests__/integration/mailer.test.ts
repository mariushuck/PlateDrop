import { sendMail } from "@/lib/email/mailer";

const MAILPIT_API = process.env.TEST_MAILPIT_API ?? "http://localhost:58025/api/v1";

type MailpitMessage = {
  ID: string;
  From: { Address: string };
  To: Array<{ Address: string }>;
  Subject: string;
};

async function clearMailbox(): Promise<void> {
  await fetch(`${MAILPIT_API}/messages`, { method: "DELETE" });
}

async function inbox(): Promise<MailpitMessage[]> {
  const response = await fetch(`${MAILPIT_API}/messages`);
  const body = (await response.json()) as { messages: MailpitMessage[] };
  return body.messages;
}

async function messageBody(id: string): Promise<{ Text: string; HTML: string }> {
  const response = await fetch(`${MAILPIT_API}/message/${id}`);
  return (await response.json()) as { Text: string; HTML: string };
}

describe("sendMail", () => {
  beforeAll(() => {
    process.env.SMTP_HOST = "localhost";
    process.env.SMTP_PORT = "51025";
    process.env.SMTP_SECURE = "false";
    process.env.MAIL_FROM = "PlateDrop <noreply@platedrop.test>";
  });

  beforeEach(clearMailbox);

  it("stellt eine Nachricht mit Absender, Empfänger, Betreff und Inhalt zu", async () => {
    await sendMail({
      to: "halter@example.com",
      subject: "Kennzeichen bestätigen",
      text: "Bitte bestätige deine Adresse: https://platedrop.test/verify?token=abc",
      html: "<p>Bitte bestätige deine Adresse.</p>",
    });

    const messages = await inbox();
    expect(messages).toHaveLength(1);
    expect(messages[0].To[0].Address).toBe("halter@example.com");
    expect(messages[0].From.Address).toBe("noreply@platedrop.test");
    expect(messages[0].Subject).toBe("Kennzeichen bestätigen");

    const body = await messageBody(messages[0].ID);
    expect(body.Text).toContain("https://platedrop.test/verify?token=abc");
  });
});
