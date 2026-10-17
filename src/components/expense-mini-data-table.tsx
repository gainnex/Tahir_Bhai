"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { SortHeader } from "@/components/data-table/column-header";
import { DataTable } from "@/components/data-table/data-table";
import { RowActions } from "@/components/data-table/row-actions";
import { ExpenseStatusBadge } from "@/components/status-badges";
import { formatAmount, formatDate } from "@/lib/format";

export type MiniRow = {
  id: number;
  expenseNo: string;
  date: string; // ISO
  amount: string; // decimal string
  paidTo: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  projectCode: string;
  projectName: string;
  head: string;
  subhead: string;
};

export function ExpenseMiniDataTable({
  rows,
  currency,
  showProject,
  showPaidTo,
  empty,
  className,
}: {
  rows: MiniRow[];
  currency: string;
  showProject: boolean;
  showPaidTo: boolean;
  empty: string;
  className?: string;
}) {
  const columns: ColumnDef<MiniRow>[] = [
    {
      accessorKey: "date",
      header: ({ column }) => <SortHeader column={column} title="Date" />,
      cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums">{formatDate(row.original.date)}</span>,
    },
    {
      accessorKey: "expenseNo",
      header: ({ column }) => <SortHeader column={column} title="No." />,
      cell: ({ row }) => (
        <Link href={`/expenses/${row.original.id}`} className="font-mono text-xs text-primary hover:underline">
          {row.original.expenseNo}
        </Link>
      ),
    },
    ...(showProject
      ? [
          {
            id: "project",
            accessorFn: (r: MiniRow) => `${r.projectCode} ${r.projectName}`,
            header: "Project",
            cell: ({ row }: { row: { original: MiniRow } }) => (
              <span>
                <span className="font-mono text-xs text-muted-foreground">{row.original.projectCode}</span>{" "}
                {row.original.projectName}
              </span>
            ),
          } satisfies ColumnDef<MiniRow>,
        ]
      : []),
    {
      id: "head",
      accessorFn: (r) => `${r.head} / ${r.subhead}`,
      header: "Head / Sub-head",
      cell: ({ row }) => (
        <span>
          {row.original.head} <span className="text-muted-foreground">/ {row.original.subhead}</span>
        </span>
      ),
      meta: { className: "hidden md:table-cell" },
    },
    ...(showPaidTo
      ? [
          {
            accessorKey: "paidTo",
            header: "Paid to",
            meta: { className: "hidden lg:table-cell max-w-48 truncate" },
          } satisfies ColumnDef<MiniRow>,
        ]
      : []),
    {
      accessorKey: "amount",
      sortingFn: (a, b) => Number(a.original.amount) - Number(b.original.amount),
      header: ({ column }) => <SortHeader column={column} title={`Amount (${currency})`} align="right" />,
      cell: ({ row }) => formatAmount(row.original.amount),
      meta: { align: "right" },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <ExpenseStatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      enableSorting: false,
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <RowActions
          label={row.original.expenseNo}
          // Read-only list: edit rights (role, approval lock) are decided on the expense page
          actions={[{ label: "View expense", icon: Eye, href: `/expenses/${row.original.id}` }]}
        />
      ),
      meta: { sticky: true },
    },
  ];

  return <DataTable columns={columns} data={rows} emptyText={empty} className={className} />;
}
