import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const customJestConfig = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  // Integrationstests brauchen ein laufendes Postgres und laufen separat
  // über `pnpm test:integration` (jest.integration.config.ts).
  testPathIgnorePatterns: ["<rootDir>/__tests__/integration/"],
};

export default createJestConfig(customJestConfig);
