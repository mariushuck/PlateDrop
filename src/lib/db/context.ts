import "server-only";
import type { PoolClient } from "pg";
import { pool } from "./pool";

/**
 * Führt `fn` in einer Transaktion aus, in der die Datenbank weiß, wer fragt.
 *
 * Unter Supabase kam diese Identität aus dem JWT und wurde von PostgREST an
 * `auth.uid()` durchgereicht. Ohne PostgREST verbindet sich die App mit einer
 * einzigen Rolle, deshalb setzen wir die Nutzer-ID hier selbst — als
 * TRANSAKTIONS-lokale Variable (dritter Parameter `true` von set_config).
 * Genau das ist der Punkt: der Wert verschwindet mit COMMIT bzw. ROLLBACK und
 * kann nicht an die nächste Anfrage durchsickern, die denselben Client aus dem
 * Pool bekommt.
 *
 * Die RLS-Policies lesen ihn über app.current_user_id() (db/migrations/0004).
 *
 * @param userId Angemeldeter Nutzer, oder `null` für eine anonyme Anfrage.
 */
export async function withUser<T>(
  userId: string | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL ist nicht gesetzt.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId ?? ""]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
      // Die Verbindung ist bereits hinüber – der ursprüngliche Fehler zählt.
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Anfrage ohne angemeldeten Nutzer — für das öffentliche Drop-Formular.
 * Die Policies sehen dann `NULL` und geben nur frei, was wirklich öffentlich
 * ist: das Einfügen einer Nachricht.
 */
export function withAnon<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withUser(null, fn);
}

/**
 * Schließt den Pool und gibt den Dev-Cache frei, sodass ein späterer Import
 * einen frischen Pool bekommt. Idempotent – nur für Tests und einen geordneten
 * Shutdown gedacht.
 */
export async function closePool(): Promise<void> {
  if (pool.ended || pool.ending) return;
  await pool.end();
  globalThis.__platedropPool = undefined;
}
