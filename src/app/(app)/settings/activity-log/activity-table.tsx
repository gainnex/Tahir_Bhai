"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { History } from "lucide-react";
import { ActivityChanges, type NameMaps } from "@/components/activity-changes";
import { DataTable } from "@/components/data-table/data-table";
import { RowActions, type RowAction } from "@/components/data-table/row-actions";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";

type LogAction = "CREATE" | "UPDATE" | "DELETE" | "APPROVE" | "REJECT" | "LOGIN";

export type ActivityRow = {
  id: number;
  createdAt: string; // ISO
  userName: string;
  action: LogAction;
  recordText: string;
  /** Link to the record itself (null for logins / deleted records). */
  href: string | null;
  /** Link to all activity for this record. */
  historyHref: string | null;
  changes: unknown;
};

const ACTION_BADGE: Record<LogAction, "info" | "warning" | "danger" | "success" | "outline"> = {
  CREATE: "info",
  UPDATE: "warning",
  DELETE: "danger",
  APPROVE: "success",
  REJECT: "danger",
  LOGIN: "outline",
};

const label = (a: string) => a.charAt(0) + a.slice(1).toLowerCase();

export function ActivityTable({ rows, names }: { rows: ActivityRow[]; names: NameMaps }) {
  const columns: ColumnDef<ActivityRow>[] = [
    {
      id: "time",
      header: "Time",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums">{formatDateTime(row.original.createdAt)}</span>
      ),
      meta: { className: "w-36 align-top" },
    },
    {
      id: "user",
      header: "User",
      enableSorting: false,
      cell: ({ row }) => row.original.userName,
      meta: { className: "align-top" },
    },
    {
      id: "action",
      header: "Action",
      enableSorting: false,
      cell: ({ row }) => <Badge variant={ACTION_BADGE[row.original.action]}>{label(row.original.action)}</Badge>,
      meta: { className: "align-top" },
    },
    {
      id: "record",
      header: "Record",
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        if (r.action === "LOGIN") return <span className="text-muted-foreground">Logged in</span>;
        return (
          <>
            {r.href ? (
              <Link href={r.href} className="text-primary hover:underline">
                {r.recordText}
              </Link>
            ) : (
              <span className="text-muted-foreground">{r.recordText}</span>
            )}
            {r.historyHref && (
              <Link
                href={r.historyHref}
                className="ml-2 text-xs text-muted-foreground hover:underline"
                title="Show all activity for this record"
              >
                history
              </Link>
            )}
          </>
        );
      },
      meta: { className: "align-top" },
    },
    {
      id: "changes",
      header: "Changes",
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        if (r.action === "CREATE" || r.action === "DELETE") {
          return r.changes ? (
            <details>
              <summary className="cursor-pointer text-xs text-primary">
                {r.action === "CREATE" ? "Created with…" : "Values at deletion…"}
              </summary>
              <div className="mt-1">
                <ActivityChanges changes={r.changes} names={names} />
              </div>
            </details>
          ) : null;
        }
        return <ActivityChanges changes={r.changes} names={names} />;
      },
      meta: { className: "min-w-72 whitespace-normal align-top" },
    },
    {
      id: "actions",
      enableSorting: false,
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const r = row.original;
        const actions: RowAction[] = [];
        if (r.href && r.action !== "LOGIN") actions.push({ label: "Open record", href: r.href });
        if (r.historyHref) actions.push({ label: "Record history", icon: History, href: r.historyHref });
        return <RowActions label={r.recordText} actions={actions} />;
      },
      meta: { sticky: true, className: "align-top" },
    },
  ];

  return <DataTable columns={columns} data={rows} emptyText="No activity found." />;
}
