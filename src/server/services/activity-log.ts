import type { LogAction, Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

// Shared helper used by every service that changes data (docs/FEATURES.md §10).
// Pass the transaction client when logging inside a transaction so the log row
// commits or rolls back together with the change.

type Client = PrismaClient | Prisma.TransactionClient;

export type LogEntry = {
  userId: number;
  action: LogAction;
  entityType: string;
  entityId: number;
  changes?: Record<string, unknown> | null;
};

export async function logActivity(entry: LogEntry, client: Client = db) {
  await client.activityLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      changes: entry.changes ? (toJson(entry.changes) as Prisma.InputJsonValue) : undefined,
    },
  });
}

/**
 * Field-level diff for UPDATE logs: { field: { old, new } } for every changed field.
 * Only the keys present in `after` are compared.
 */
export function diffChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  ignore: string[] = ["updatedAt", "createdAt"],
): Record<string, { old: unknown; new: unknown }> {
  const out: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (ignore.includes(key)) continue;
    const a = normalize(before[key]);
    const b = normalize(after[key]);
    if (JSON.stringify(a) !== JSON.stringify(b)) out[key] = { old: a, new: b };
  }
  return out;
}

/** Snapshot of a record for CREATE / DELETE logs. */
export function snapshot(record: Record<string, unknown>, omit: string[] = []) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (!omit.includes(k) && !["createdAt", "updatedAt"].includes(k)) out[k] = normalize(v);
  }
  return out;
}

// Decimals and Dates are stored as strings so the JSON is readable and exact.
function normalize(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (v !== null && typeof v === "object" && "toFixed" in v && "d" in v) return v.toString();
  return v;
}

function toJson(obj: Record<string, unknown>): unknown {
  return JSON.parse(JSON.stringify(obj, (_k, v) => normalize(v)));
}
