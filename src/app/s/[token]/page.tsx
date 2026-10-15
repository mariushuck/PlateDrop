import type { Metadata } from "next";
import Link from "next/link";
import JoinSiteButton from "@/components/features/JoinSiteButton";
import MessageForm from "@/components/features/MessageForm";
import NavBar from "@/components/ui/NavBar";
import { getSessionUser } from "@/lib/auth/session";
import { membershipStatus, siteByToken } from "@/lib/db/queries";
import { SITE_TOKEN_PATTERN } from "@/lib/tags/token";
import { dropSiteMessage } from "./actions";

export const metadata: Metadata = {
  title: "Nachricht am Standort | PlateDrop",
  // Standort-Seiten gehören nicht in Suchmaschinen.
  robots: { index: false, follow: false },
};

/**
 * Ziel des QR-Codes auf Schild und Aushang. Öffentlich: jede Person kann einem
 * Fahrzeug auf diesem Gelände schreiben. Angemeldete Nutzer können außerdem
 * beitreten, um selbst erreichbar zu sein.
 */
export default async function SitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const site = SITE_TOKEN_PATTERN.test(token) ? await siteByToken(token) : null;

  if (!site?.active) {
    // Neutral: verrät nicht, ob es den Code gab oder er deaktiviert wurde.
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
        <h1 className="text-[22px] font-bold">Code nicht gültig</h1>
        <p className="text-[15px] text-secondary">
          Dieser Code führt zu keinem aktiven Gelände. Eine Nachricht an ein beliebiges Kennzeichen
          kannst du trotzdem hinterlassen.
        </p>
        <Link href="/" className="btn btn-primary mt-3">
          Zur Startseite
        </Link>
      </main>
    );
  }

  const user = await getSessionUser();
  const status = user ? await membershipStatus(user.id, site.siteId) : null;

  return (
    <div className="flex flex-1 flex-col">
      <NavBar>
        <span className="truncate text-[17px] font-semibold">{site.orgName}</span>
        {!user && (
          <Link
            href={`/login?next=/s/${token}`}
            className="btn-plain text-[17px] active:opacity-60"
          >
            Anmelden
          </Link>
        )}
      </NavBar>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-4 pt-6 pb-8">
        <div>
          <h1 className="large-title">{site.siteName}</h1>
          <p className="mt-1 text-[17px] text-secondary">
            Nachricht an ein Fahrzeug auf diesem Gelände
          </p>
        </div>

        <MessageForm
          action={dropSiteMessage}
          hiddenFields={{ token }}
          allowFreeText={Boolean(user && status === "active" && site.allowFreeText)}
        />

        <section>
          <h2 className="section-header">Selbst erreichbar sein</h2>
          <div className="inset-group p-4 text-[15px]">
            {!user ? (
              <p>
                Du parkst hier regelmäßig?{" "}
                <Link href={`/login?next=/s/${token}`} className="font-semibold text-tint">
                  Anmelden
                </Link>{" "}
                und dem Gelände beitreten, dann erreichen dich Nachrichten an dein Kennzeichen.
              </p>
            ) : status === "active" ? (
              <p>
                Du bist Mitglied. Deine Kennzeichen für dieses Gelände verwaltest du im{" "}
                <Link href="/dashboard" className="font-semibold text-tint">
                  Dashboard
                </Link>
                .
              </p>
            ) : status === "pending" ? (
              <p>Dein Beitritt wartet auf die Bestätigung durch die Verwaltung.</p>
            ) : (
              <JoinSiteButton token={token} />
            )}
          </div>
          {site.showSender && (
            <p className="section-footer">
              Angemeldete Absender:innen sind für die Empfänger:in mit Namen sichtbar.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
