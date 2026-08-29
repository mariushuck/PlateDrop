import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/server";

/**
 * Endpunkte von better-auth (Anmeldung, Registrierung, Session, Bestätigungs-
 * und Reset-Links). Die Links aus den E-Mails zeigen hierher, deshalb muss der
 * Handler existieren – die Formulare selbst laufen weiterhin über Server
 * Actions.
 */
export const { GET, POST } = toNextJsHandler(auth);
