import type { Config } from "jest";

/**
 * Integrationstests laufen gegen ein echtes Postgres und Mailpit
 * (docker-compose.test.yml) und sind deshalb vom Standard-Lauf getrennt –
 * sie setzen ein laufendes Docker voraus. Start über `pnpm test:integration`.
 *
 * Bewusst ohne `next/jest`: dessen Konfiguration lässt sich bei
 * `transformIgnorePatterns` nur erweitern, nicht überschreiben, und
 * node_modules bleiben dort grundsätzlich untransformiert. better-auth wird
 * aber ausschließlich als ESM ausgeliefert und muss durch die Transformation.
 */
const config: Config = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/__tests__/integration/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // Markiert Server-Module nur zur Bauzeit; im Test ein No-op.
    "^server-only$": "<rootDir>/__tests__/integration/stubs/server-only.ts",
  },
  transform: {
    "^.+\\.(t|j)sx?$": [
      "@swc/jest",
      {
        jsc: { parser: { syntax: "typescript" }, target: "es2022" },
        module: { type: "commonjs" },
      },
    ],
    "^.+\\.mjs$": [
      "@swc/jest",
      { jsc: { parser: { syntax: "ecmascript" }, target: "es2022" }, module: { type: "commonjs" } },
    ],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "mjs", "json"],
  // ESM-Pakete aus dem better-auth-Umfeld müssen transformiert werden.
  transformIgnorePatterns: [
    "/node_modules/\\.pnpm/(?!(better-auth|@better-auth\\+|better-call|@better-fetch\\+|@noble\\+|nanostores|jose|kysely|defu|zod|uncrypto)@)",
  ],
  testTimeout: 30_000,
};

export default config;
