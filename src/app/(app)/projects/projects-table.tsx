"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Pencil, Plus } from "lucide-react";
import { BudgetBar } from "@/components/budget-bar";
import { SortHeader } from "@/components/data-table/column-header";
import { DataTable } from "@/components/data-table/data-table";
import { RowActions, type RowAction } from "@/components/data-table/row-actions";
import { ProjectStatusBadge } from "@/components/status-badges";
import type { BudgetUsage } from "@/lib/budget";
import { formatAmount } from "@/lib/format";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, type ProjectStatus } from "@/lib/validation/projects";

export type ProjectListRow = {
  id: number;
  code: string;
  name: string;
  clientName: string | null;
  location: string | null;
  status: ProjectStatus;
  budget: string | null; // decimal string
  spent: string; // decimal string
  usage: BudgetUsage | null;
};

const byNumber = (a: string | null, b: string | null) => Number(a ?? -1) - Number(b ?? -1);

export function ProjectsTable({
  rows,
  currency,
  canManage,
  emptyText,
  className,
}: {
  rows: ProjectListRow[];
  currency: string;
  canManage: boolean;
  emptyText: string;
  className?: string;
}) {
  const columns: ColumnDef<ProjectListRow>[] = [
    {
      accessorKey: "code",
      header: ({ column }) => <SortHeader column={column} title="Code" />,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span>,
    },
    {
      id: "project",
      accessorFn: (r) => `${r.name} ${r.clientName ?? ""} ${r.location ?? ""}`,
      sortingFn: (a, b) => a.original.name.localeCompare(b.original.name),
      header: ({ column }) => <SortHeader column={column} title="Project" />,
      cell: ({ row }) => (
        <div className="min-w-48 whitespace-normal">
          <Link href={`/projects/${row.original.id}`} className="font-medium text-primary hover:underline">
            {row.original.name}
          </Link>
          <div className="text-xs text-muted-foreground">
            {[row.original.clientName, row.original.location].filter(Boolean).join(" · ")}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "status",
      filterFn: "arrIncludesSome",
      sortingFn: (a, b) => PROJECT_STATUSES.indexOf(a.original.status) - PROJECT_STATUSES.indexOf(b.original.status),
      header: ({ column }) => <SortHeader column={column} title="Status" />,
      cell: ({ row }) => <ProjectStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "budget",
      sortingFn: (a, b) => byNumber(a.original.budget, b.original.budget),
      header: ({ column }) => <SortHeader column={column} title={`Budget (${currency})`} align="right" />,
      cell: ({ row }) => (row.original.budget ? formatAmount(row.original.budget) : "—"),
      meta: { align: "right" },
    },
    {
      accessorKey: "spent",
      sortingFn: (a, b) => byNumber(a.original.spent, b.original.spent),
      header: ({ column }) => <SortHeader column={column} title={`Spent (${currency})`} align="right" />,
      cell: ({ row }) => formatAmount(row.original.spent),
      meta: { align: "right" },
    },
    {
      id: "usage",
      accessorFn: (r) => r.usage?.percentUsed ?? -1,
      header: ({ column }) => <SortHeader column={column} title="Spent vs budget" />,
      cell: ({ row }) => (
        <div className="w-40">
          <BudgetBar usage={row.original.usage} compact />
        </div>
      ),
    },
    {
      id: "actions",
      enableSorting: false,
      enableGlobalFilter: false,
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const p = row.original;
        const actions: RowAction[] = [{ label: "View", icon: Eye, href: `/projects/${p.id}` }];
        if (canManage) actions.push({ label: "Edit", icon: Pencil, href: `/projects/${p.id}/edit` });
        // Completed projects are locked: no new expenses (same rule as the profile page)
        if (p.status !== "COMPLETED")
          actions.push({ label: "New expense", icon: Plus, href: `/expenses/new?projectId=${p.id}` });
        return <RowActions label={p.code} actions={actions} />;
      },
      meta: { sticky: true },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyText={emptyText}
      searchPlaceholder="Search code, name, client or location"
      facets={[
        {
          columnId: "status",
          title: "Status",
          options: PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] })),
        },
      ]}
      className={className}
    />
  );
}
