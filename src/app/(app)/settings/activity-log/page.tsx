import Link from "next/link";
import type { LogAction } from "@prisma/client";
import { Search } from "lucide-react";
import { Field } from "@/components/forms/field";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { db } from "@/lib/db";
import { requireRole } from "@/server/auth";
import {
  ENTITY_TYPES,
  entityHref,
  listActivity,
  LOG_ACTIONS,
  type ActivityFilters,
  type EntityType,
} from "@/server/services/activity-service";
import { ActivityTable, type ActivityRow } from "./activity-table";

export const metadata = { title: "Activity log" };

const ENTITY_LABEL: Record<EntityType, string> = {
  expense: "Expense",
  project: "Project",
  vendor: "Vendor",
  worker: "Worker",
  user: "User",
  expense_head: "Expense head",
  expense_subhead: "Sub-head",
  settings: "Settings",
};

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const int = (v: string | string[] | undefined) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);
const date = (v: string | string[] | undefined) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

function qs(f: ActivityFilters, page: number) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, page })) if (v !== undefined && !(k === "page" && v === 1)) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default async function ActivityLogPage({ searchParams }: PageProps<"/settings/activity-log">) {
  const actor = await requireRole("ADMIN");
  const sp = await searchParams;
  const f: ActivityFilters = {
    userId: int(sp.userId),
    action: LOG_ACTIONS.includes(str(sp.action) as LogAction) ? (str(sp.action) as LogAction) : undefined,
    entityType: ENTITY_TYPES.includes(str(sp.entityType) as EntityType) ? (str(sp.entityType) as EntityType) : undefined,
    entityId: int(sp.entityId),
    from: date(sp.from),
    to: date(sp.to),
  };
  const page = int(sp.page) ?? 1;
  const [result, users] = await Promise.all([
    listActivity(actor, { ...f, page }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const filtered = Object.values(f).some((v) => v !== undefined);

  // Plain rows for the client table (links resolved here, on the server)
  const rows: ActivityRow[] = result.rows.map((r) => {
    const type = ENTITY_LABEL[r.entityType as EntityType] ?? r.entityType;
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      userName: r.user.name,
      action: r.action,
      recordText: r.entityType === "settings" ? "Company settings" : `${type} ${r.entityLabel ?? `#${r.entityId}`}`,
      href: entityHref(r.entityType, r.entityId),
      historyHref:
        r.action !== "LOGIN" && r.entityType !== "settings"
          ? `/settings/activity-log?entityType=${r.entityType}&entityId=${r.entityId}`
          : null,
      changes: r.changes,
    };
  });

  return (
    <>
      <PageHeader
        title="Activity log"
        description="Every create, edit, approval, rejection, delete and login, with old → new values."
      />

      <Card className="mb-4 py-3 sm:py-4">
        <CardContent className="px-3 sm:px-4">
          <form className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6" role="search">
            <Field label="User">
              <Combobox
                name="userId"
                defaultValue={f.userId ? String(f.userId) : ""}
                clearLabel="Everyone"
                placeholder="Everyone"
                searchPlaceholder="Search users…"
                options={users.map((u) => ({ value: String(u.id), label: u.name }))}
              />
            </Field>
            <Field label="Record type">
              <Combobox
                name="entityType"
                defaultValue={f.entityType ?? ""}
                clearLabel="All types"
                placeholder="All types"
                options={ENTITY_TYPES.map((t) => ({ value: t, label: ENTITY_LABEL[t] }))}
              />
            </Field>
            <Field label="Action">
              <Combobox
                name="action"
                defaultValue={f.action ?? ""}
                clearLabel="All actions"
                placeholder="All actions"
                options={LOG_ACTIONS.map((a) => ({ value: a, label: a.charAt(0) + a.slice(1).toLowerCase() }))}
              />
            </Field>
            <Field label="From">
              <DatePicker name="from" defaultValue={f.from ?? ""} placeholder="Any date" clearable />
            </Field>
            <Field label="To">
              <DatePicker name="to" defaultValue={f.to ?? ""} placeholder="Any date" clearable />
            </Field>
            {f.entityId && <input type="hidden" name="entityId" value={f.entityId} />}
            <div className="flex items-end gap-2">
              <Button type="submit" variant="secondary">
                <Search /> Filter
              </Button>
              {filtered && (
                <Link href="/settings/activity-log" className={buttonVariants({ variant: "ghost" })}>
                  Clear
                </Link>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline" className="bg-card font-mono tabular-nums">
          {result.count}
        </Badge>
        <span>
          {result.count === 1 ? "entry" : "entries"}
          {f.entityId && f.entityType && (
            <>
              {` for ${ENTITY_LABEL[f.entityType].toLowerCase()} `}
              <span className="font-mono">#{f.entityId}</span>
            </>
          )}
        </span>
      </div>

      <ActivityTable rows={rows} names={result.names} />

      {result.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page <span className="font-mono tabular-nums">{result.page}</span> of{" "}
            <span className="font-mono tabular-nums">{result.pages}</span>
          </span>
          <div className="flex gap-2">
            {result.page > 1 && (
              <Link href={`/settings/activity-log${qs(f, result.page - 1)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                ← Newer
              </Link>
            )}
            {result.page < result.pages && (
              <Link href={`/settings/activity-log${qs(f, result.page + 1)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Older →
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
