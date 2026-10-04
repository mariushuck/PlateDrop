#!/usr/bin/env node
/**
 * Erzeugt db/migrations/0002_auth.sql aus der installierten better-auth-Version.
 *
 * Nur bei einem better-auth-Upgrade nötig. Ausgabe gegen eine LEERE Datenbank
 * laufen lassen, sonst enthält der Plan nur die Differenz zum Ist-Zustand:
 *
 *   pnpm test:db:up
 *   DATABASE_URL=postgres://platedrop_owner:test@localhost:55432/platedrop_test \
 *     node scripts/generate-auth-schema.mjs
 *
 * Das Ergebnis wird von Hand in 0002_auth.sql übernommen (Kommentare, DEFAULT
 * auf is_admin). Ob es zur Laufzeit-Konfiguration passt, prüft der
 * Integrationstest __tests__/integration/auth.test.ts.
 */
import { randomUUID } from "node:crypto";
import { getMigrations } from "better-auth/db/migration";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Schema-relevante Optionen aus src/lib/auth/server.ts gespiegelt.
// Mail-Callbacks lässt der Generator unberührt – sie beeinflussen kein Schema.
const options = {
  database: pool,
  secret: "schema-generation-only-secret-value-32ch",
  emailAndPassword: { enabled: true, minPasswordLength: 6, requireEmailVerification: true },
  emailVerification: { sendOnSignUp: true, autoSignInAfterVerification: true },
  user: {
    modelName: "users",
    additionalFields: {
      isAdmin: { type: "boolean", defaultValue: false, input: false, fieldName: "is_admin" },
    },
    changeEmail: { enabled: true },
  },
  session: { modelName: "sessions" },
  account: { modelName: "accounts" },
  verification: { modelName: "verifications" },
  advanced: { database: { generateId: () => randomUUID() } },
};

const { compileMigrations, toBeCreated } = await getMigrations(options);
console.error(`Tabellen: ${toBeCreated.map((t) => t.table).join(", ")}`);
console.log(await compileMigrations());
await pool.end();
