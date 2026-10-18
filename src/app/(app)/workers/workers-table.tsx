"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Pencil, Plus } from "lucide-react";
import { SortHeader } from "@/components/data-table/column-header";
import { DataTable } from "@/components/data-table/data-table";
import { RowActions, type RowAction } from "@/components/data-table/row-actions";
import { ActiveBadge } from "@/components/status-badges";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAmount, rateLabel } from "@/lib/format";
import {
  EMPLOYEE_TYPE_LABELS,
  EMPLOYEE_TYPES,
  TRADE_LABELS,
  TRADES,
  type EmployeeType,
  type RateType,
  type Trade,
} from "@/lib/validation/parties";

export type WorkerListRow = {
  id: number;
  name: string;
  employeeType: EmployeeType;
  designation: string;
  trade: Trade;
  rate: string; // decimal string
  rateType: RateType;
  cnic: string;
  defaultProjectCode: string;
  defaultProjectName: string;
  totalPaid: string; // decimal string
  status: "active" | "inactive";
};

export function WorkersTable({
  rows,
  currency,
  canManage,
  emptyText,
}: {
  rows: WorkerListRow[];
  currency: string;
  canManage: boolean;
  emptyText: string;
}) {
  const columns: ColumnDef<WorkerListRow>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <SortHeader column={column} title="Name" />,
      cell: ({ row }) => (
        <Link href={`/workers/${row.original.id}`} className="font-medium text-primary hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "employeeType",
      filterFn: "arrIncludesSome",
      header: ({ column }) => <SortHeader column={column} title="Type" />,
      cell: ({ row }) => (
        <span>
          {EMPLOYEE_TYPE_LABELS[row.original.employeeType]}
          <span className="block text-xs text-muted-foreground">
            {row.original.designation || (row.original.employeeType === "LABOUR" ? TRADE_LABELS[row.original.trade] : "")}
          </span>
        </span>
      ),
    },
    {
      accessorKey: "trade",
      filterFn: "arrIncludesSome",
      header: ({ column }) => <SortHeader column={column} title="Trade" />,
      cell: ({ row }) => TRADE_LABELS[row.original.trade],
      // Shown under the type on narrower screens
      meta: { className: "hidden 2xl:table-cell" },
    },
    {
      accessorKey: "rate",
      sortingFn: (a, b) => Number(a.original.rate) - Number(b.original.rate),
      header: ({ column }) => <SortHeader column={column} title="Rate" align="right" />,
      cell: ({ row }) => rateLabel(row.original.rate, row.original.rateType, currency),
      meta: { align: "right" },
    },
    {
      accessorKey: "cnic",
      enableSorting: false,
      header: "CNIC",
      cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums">{row.original.cnic}</span>,
      meta: { className: "hidden 2xl:table-cell" },
    },
    {
      accessorKey: "defaultProjectCode",
      header: ({ column }) => <SortHeader column={column} title="Cost center" />,
      cell: ({ row }) =>
        row.original.defaultProjectCode ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default font-mono text-xs">{row.original.defaultProjectCode}</span>
            </TooltipTrigger>
            <TooltipContent>{row.original.defaultProjectName}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      meta: { className: "hidden md:table-cell" },
    },
    {
      accessorKey: "totalPaid",
      sortingFn: (a, b) => Number(a.original.totalPaid) - Number(b.original.totalPaid),
      header: ({ column }) => <SortHeader column={column} title={`Total paid (${currency})`} align="right" />,
      cell: ({ row }) => formatAmount(row.original.totalPaid),
      meta: { align: "right" },
    },
    {
      accessorKey: "status",
      filterFn: "arrIncludesSome",
      header: "Status",
      enableSorting: false,
      cell: ({ row }) => <ActiveBadge active={row.original.status === "active"} />,
    },
    {
      id: "actions",
      enableSorting: false,
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const w = row.original;
        const actions: RowAction[] = [{ label: "View", icon: Eye, href: `/workers/${w.id}` }];
        if (canManage) actions.push({ label: "Edit", icon: Pencil, href: `/workers/${w.id}/edit` });
        if (w.status === "active") {
          actions.push("separator");
          actions.push({ label: "Record payment", icon: Plus, href: `/labour-payment?workerId=${w.id}` });
        }
        return <RowActions label={w.name} actions={actions} />;
      },
      meta: { sticky: true },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyText={emptyText}
      facets={[
        {
          columnId: "employeeType",
          title: "Type",
          options: EMPLOYEE_TYPES.map((t) => ({ value: t, label: EMPLOYEE_TYPE_LABELS[t] })),
        },
        { columnId: "trade", title: "Trade", options: TRADES.map((t) => ({ value: t, label: TRADE_LABELS[t] })) },
        {
          columnId: "status",
          title: "Status",
          options: [
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ],
        },
      ]}
      className="hidden sm:block"
    />
  );
}
