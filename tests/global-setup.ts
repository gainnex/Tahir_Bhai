import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// Fresh test database for every run — only ever the TEST database, never dev or production.
export default function setup() {
  const pgUrl = process.env.TEST_DATABASE_URL;
  const env = {
    ...process.env,
    DATABASE_PROVIDER: pgUrl ? "postgresql" : "sqlite",
    DATABASE_URL: pgUrl ?? "file:./test.db",
    SEED_SAMPLE_DATA: "false",
  };
  const run = (cmd: string) => execSync(cmd, { env, stdio: "pipe" });
  rmSync("tests/.uploads", { recursive: true, force: true });

  if (pgUrl) {
    // Empty the test schema, then apply the real migrations (same path as production).
    execSync(`node scripts/prisma.mjs db execute --stdin`, {
      env,
      input: "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;",
      stdio: ["pipe", "pipe", "pipe"],
    });
    run("node scripts/prisma.mjs migrate deploy");
  } else {
    rmSync("prisma/sqlite/test.db", { force: true });
    rmSync("prisma/sqlite/test.db-journal", { force: true });
    run("node scripts/prisma.mjs db push --skip-generate");
  }
  // Generate the client for the provider under test.
  run("node scripts/prisma.mjs generate");
  run("npx tsx prisma/seed.ts");
}
