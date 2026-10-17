import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests run the service layer against a throw-away database, recreated before every run by
// tests/global-setup.ts:
//   npm test                                    -> SQLite file prisma/sqlite/test.db
//   TEST_DATABASE_URL=postgresql://… npm test   -> that PostgreSQL database (ALL DATA IN IT IS WIPED)
const pgUrl = process.env.TEST_DATABASE_URL;

export default defineConfig({
  resolve: { alias: { "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src") } },
  test: {
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    env: {
      DATABASE_PROVIDER: pgUrl ? "postgresql" : "sqlite",
      DATABASE_URL: pgUrl ?? "file:./test.db",
      UPLOAD_DIR: "./tests/.uploads",
      SESSION_SECRET: "test-secret-test-secret-test-secret-123",
    },
    fileParallelism: false, // one shared database
    testTimeout: 20000,
  },
});
