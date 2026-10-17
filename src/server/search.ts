import type { Prisma } from "@prisma/client";

const isPostgres = (process.env.DATABASE_PROVIDER ?? "postgresql") === "postgresql";

/**
 * Case-insensitive "contains" filter on both databases. SQLite's LIKE is already
 * case-insensitive; Postgres needs mode: "insensitive" (which SQLite rejects).
 */
export function icontains(q: string): Prisma.StringFilter {
  return (isPostgres ? { contains: q, mode: "insensitive" } : { contains: q }) as Prisma.StringFilter;
}
