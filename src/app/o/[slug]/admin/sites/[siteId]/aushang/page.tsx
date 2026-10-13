import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import PrintButton from "@/components/features/PrintButton";
import { requireUser } from "@/lib/auth/session";
import { listOrgSites, orgForAdmin } from "@/lib/db/queries";
import { requireEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Aushang | PlateDrop" };

/**
 * Druckbare Seite für Schild und Aushang: QR-Code, Kurz-URL, ein Satz Nutzen.
 * Gedruckt oder als PDF gespeichert über den Browser – keine PDF-Bibliothek,
 * kein eigener Route Handler. Fehlerkorrektur Q: ein verschmutzter Aushang
 * bleibt lesbar.
 */
export default async function AushangPage({
  params,
}: {
  params: Promise<{ slug: string; siteId: string }>;
}) {
  const { slug, siteId } = await params;
  const user = await requireUser();
  const org = await orgForAdmin(user.id, slug);
  if (!org) notFound();
  const site = (await listOrgSites(user.id, org.id)).find((s) => s.id === siteId);
  if (!site || site.disabled) notFound();

  const url = `${requireEnv("BETTER_AUTH_URL").replace(/\/$/, "")}/s/${site.token}`;
  const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "Q", margin: 1 });

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 px-6 py-10 text-center text-slate-900 print:py-0 dark:text-white print:dark:text-slate-900">
      <PrintButton />
      <p className="text-sm font-semibold uppercase tracking-wide">{org.name}</p>
      <h1 className="text-4xl font-bold">Fahrzeug blockiert? Licht an?</h1>
      <p className="text-xl">Code scannen und dem Halter direkt Bescheid geben.</p>
      <div
        className="w-72 max-w-full bg-white p-2"
        // Vom Server erzeugtes SVG aus einer eigenen URL – kein Fremdinhalt.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: qrcode liefert reines SVG
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="break-all font-mono text-sm">{url}</p>
      <p className="text-lg font-semibold">{site.name}</p>
      <p className="max-w-md text-sm">
        Anonym, ohne App. Wer hier regelmäßig parkt: Code scannen, anmelden, beitreten – dann
        erreichen dich Nachrichten an dein Kennzeichen. Im Notfall 110 oder 112.
      </p>
    </div>
  );
}
