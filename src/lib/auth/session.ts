import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./server";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  isAdmin: boolean;
}

/**
 * Liest die aktuelle Session aus dem Request-Cookie.
 *
 * @returns Den angemeldeten Nutzer oder `null`.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const { id, email, name, emailVerified, isAdmin } = session.user;
  return { id, email, name, emailVerified, isAdmin: isAdmin === true };
}

/**
 * Erzwingt eine Anmeldung. Ersetzt den vorherigen clientseitigen Check im
 * Dashboard, der erst nach dem Rendern zu /login umgeleitet hat.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Erzwingt Admin-Rechte.
 *
 * Unter Supabase steckte diese Prüfung in jeder Admin-Server-Action als
 * `profiles`-Abfrage. Jetzt reicht das Session-Objekt, weil `is_admin` direkt
 * auf der Nutzertabelle liegt. Die RLS-Policies prüfen zusätzlich mit.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/dashboard");
  return user;
}
