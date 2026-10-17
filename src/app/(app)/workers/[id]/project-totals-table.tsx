"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { SortHeader } from "@/components/data-table/column-header";
import { DataTable } from "@/components/data-table/data-table";
import { formatAmount } from "@/lib/format";

export type ProjectTotalRow = {
  projectId: number;
  code: string;
  name: string;
  count: number;
  wages: string; // decimal strings
  advances: string;
  total: string;
};

const byNumber = (key: "wages" | "advances" | "total") => (a: { original: ProjectTotalRow }, b: { original: ProjectTotalRow }) =>
  Number(a.original[key]) - Number(b.original[key]);

/** Worker profile "Totals by project", with a totals row when there is more than one project. */
export function ProjectTotalsTable({
  rows,
  currency,
  totals,
}: {
  rows: ProjectTotalRow[];
  currency: string;
  totals?: { count: number; wages: string; advances: string; total: string };
}) {
  const columns: ColumnDef<ProjectTotalRow>[] = [
    {
      id: "project",
      accessorFn: (r) => r.code,
      header: ({ column }) => <SortHeader column={column} title="Project" />,
      cell: ({ row }) => (
        <Link href={`/projects/${row.original.projectId}`} className="hover:underline">
          <span className="font-mono text-xs text-muted-foreground">{row.original.code}</span> {row.original.name}
        </Link>
      ),
      meta: { className: "whitespace-normal", footer: totals ? "Total" : undefined },
    },
    {
      accessorKey: "count",
      header: ({ column }) => <SortHeader column={column} title="Payments" align="right" />,
      meta: { align: "right", footer: totals?.count },
    },
    {
      accessorKey: "wages",
      sortingFn: byNumber("wages"),
      header: ({ column }) => <SortHeader column={column} title={`Wages (${currency})`} align="right" />,
      cell: ({ row }) => formatAmount(row.original.wages),
      meta: { align: "right", footer: totals && formatAmount(totals.wages) },
    },
    {
      accessorKey: "advances",
      sortingFn: byNumber("advances"),
      header: ({ column }) => <SortHeader column={column} title={`Advances (${currency})`} align="right" />,
      cell: ({ row }) => formatAmount(row.original.advances),
      meta: { align: "right", footer: totals && formatAmount(totals.advances) },
    },
    {
      accessorKey: "total",
      sortingFn: byNumber("total"),
      header: ({ column }) => <SortHeader column={column} title={`Total (${currency})`} align="right" />,
      cell: ({ row }) => formatAmount(row.original.total),
      meta: { align: "right", footer: totals && formatAmount(totals.total) },
    },
  ];
  return <DataTable columns={columns} data={rows} emptyText="No approved payments yet." showFooter={!!totals} />;
}
