#!/usr/bin/env node
// Thin wrapper around the Prisma CLI that picks the schema from DATABASE_PROVIDER.
//
//   DATABASE_PROVIDER=postgresql (default) -> prisma/schema.prisma (+ prisma/migrations)
//   DATABASE_PROVIDER=sqlite               -> prisma/sqlite/schema.prisma (generated here)
//
// Usage: node scripts/prisma.mjs <prisma args...>
//   e.g. node scripts/prisma.mjs generate
//        node scripts/prisma.mjs migrate deploy
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pgSchema = path.join(root, "prisma", "schema.prisma");
const provider = process.env.DATABASE_PROVIDER ?? "postgresql";

let schema = pgSchema;
let args = process.argv.slice(2);

if (provider === "sqlite") {
  const src = readFileSync(pgSchema, "utf8");
  const out = src
    .replace(/provider = "postgresql"/, 'provider = "sqlite"')
    // SQLite has no native type modifiers
    .replace(/\s@db\.\w+(\([^)]*\))?/g, "");
  const dir = path.join(root, "prisma", "sqlite");
  mkdirSync(dir, { recursive: true });
  schema = path.join(dir, "schema.prisma");
  writeFileSync(
    schema,
    "// AUTO-GENERATED from prisma/schema.prisma by scripts/prisma.mjs — do not edit.\n" + out,
  );
  // SQLite dev databases are kept in sync with `db push` instead of the Postgres migrations.
  if (args[0] === "migrate" && (args[1] === "deploy" || args[1] === "dev")) {
    args = ["db", "push", "--skip-generate"];
  }
} else if (provider !== "postgresql") {
  console.error(`Unsupported DATABASE_PROVIDER "${provider}" (use postgresql or sqlite)`);
  process.exit(1);
}

const res = spawnSync("npx", ["prisma", ...args, "--schema", schema], {
  stdio: "inherit",
  cwd: root,
});
process.exit(res.status ?? 1);
