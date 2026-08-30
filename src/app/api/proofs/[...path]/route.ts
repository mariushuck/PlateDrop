import { getSessionUser } from "@/lib/auth/session";
import { canReadProof } from "@/lib/db/queries";
import { logger } from "@/lib/logger";
import { InvalidProofPathError, readProof } from "@/lib/storage/proofs";

/**
 * Liefert ein Beweisfoto aus – aber nur an den Halter oder einen Admin.
 *
 * Dies ist die einzige API-Route der Anwendung neben den Auth-Endpunkten.
 * Die Projektregel „Mutationen ausschließlich über Server Actions" bleibt
 * unberührt: hier wird nichts verändert, es wird nur gelesen. Ein Route
 * Handler ist nötig, weil ein <img>-Tag eine URL braucht, keine Server Action.
 *
 * Damit entfällt die frühere Signed-URL-Mechanik von Supabase Storage: statt
 * einen Link für zehn Minuten freizugeben, wird bei jedem einzelnen Abruf neu
 * geprüft. Wird ein Kennzeichen abgelehnt oder gelöscht, endet der Zugriff
 * sofort statt erst mit Ablauf der Signatur.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/proofs/[...path]">) {
  const user = await getSessionUser();
  if (!user) {
    return new Response("Nicht angemeldet.", { status: 401 });
  }

  const { path } = await ctx.params;
  const objectPath = path.join("/");

  // Die Berechtigung entscheiden die RLS-Policies: der Halter sieht nur seine
  // eigene Zeile, ein Admin jede. Findet die Abfrage nichts, gibt es das Bild
  // für diesen Nutzer nicht – bewusst 404 statt 403, damit die Antwort nicht
  // verrät, dass der Pfad existiert.
  let allowed: boolean;
  try {
    allowed = await canReadProof(user.id, objectPath);
  } catch (err) {
    logger.error("Fehler bei der Zugriffsprüfung für ein Beweisfoto:", err);
    return new Response("Fehler beim Laden des Bildes.", { status: 500 });
  }

  if (!allowed) {
    return new Response("Nicht gefunden.", { status: 404 });
  }

  try {
    const proof = await readProof(objectPath);
    if (!proof) {
      return new Response("Nicht gefunden.", { status: 404 });
    }

    return new Response(new Uint8Array(proof.bytes), {
      headers: {
        "Content-Type": proof.contentType,
        // Personenbezogenes Bildmaterial: weder im Browser noch in einem Proxy
        // zwischenspeichern.
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof InvalidProofPathError) {
      return new Response("Nicht gefunden.", { status: 404 });
    }
    logger.error("Fehler beim Laden des Beweisfotos:", err);
    return new Response("Fehler beim Laden des Bildes.", { status: 500 });
  }
}
