import type { Metadata } from "next";
import Link from "next/link";
import JoinSiteButton from "@/components/features/JoinSiteButton";
import MessageForm from "@/components/features/MessageForm";
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
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Code nicht gültig</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Dieser Code führt zu keinem aktiven Gelände. Eine Nachricht an ein beliebiges Kennzeichen
          kannst du trotzdem hinterlassen.
        </p>
        <Link href="/" className="font-semibold text-slate-900 underline dark:text-white">
          Zur Startseite
        </Link>
      </main>
    );
  }

  const user = await getSessionUser();
  const status = user ? await membershipStatus(user.id, site.siteId) : null;

  return (
    <div className="flex min-h-screen flex-col bg-linear-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
      <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col items-center gap-1 px-4 py-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {site.orgName}
          </p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{site.siteName}</h1>
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Nachricht an ein Fahrzeug auf diesem Gelände
          </p>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-8 px-4 py-8">
        <MessageForm
          action={dropSiteMessage}
          hiddenFields={{ token }}
          allowFreeText={Boolean(user && status === "active" && site.allowFreeText)}
        />

        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">
            Selbst erreichbar sein
          </h2>
          {!user ? (
            <p className="text-slate-600 dark:text-slate-400">
              Du parkst hier regelmäßig?{" "}
              <Link
                href={`/login?next=/s/${token}`}
                className="font-semibold text-slate-900 underline dark:text-white"
              >
                Anmelden
              </Link>{" "}
              und dem Gelände beitreten, dann erreichen dich Nachrichten an dein Kennzeichen.
            </p>
          ) : status === "active" ? (
            <p className="text-slate-600 dark:text-slate-400">
              Du bist Mitglied. Deine Kennzeichen für dieses Gelände verwaltest du im{" "}
              <Link href="/dashboard" className="font-semibold underline">
                Dashboard
              </Link>
              .
            </p>
          ) : status === "pending" ? (
            <p className="text-slate-600 dark:text-slate-400">
              Dein Beitritt wartet auf die Bestätigung durch die Verwaltung.
            </p>
          ) : (
            <JoinSiteButton token={token} />
          )}
          {site.showSender && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Angemeldete Absender:innen sind für die Empfänger:in mit Namen sichtbar.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
