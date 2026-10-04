import "server-only";
import { Pool } from "pg";

/**
 * Ein Pool pro Prozess. Im Dev-Modus überlebt er den Hot-Reload über
 * globalThis, sonst würde jede Änderung eine neue Verbindungswelle öffnen.
 */
declare global {
  // eslint-disable-next-line no-var
  var __platedropPool: Pool | undefined;
}

function createPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export const pool: Pool = globalThis.__platedropPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalThis.__platedropPool = pool;
}
