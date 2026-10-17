"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Pencil, Receipt } from "lucide-react";
import { SortHeader } from "@/components/data-table/column-header";
import { DataTable } from "@/components/data-table/data-table";
import { RowActions } from "@/components/data-table/row-actions";
import { Badge } from "@/components/ui/badge";
import { formatAmount } from "@/lib/format";
import { VENDOR_TYPE_LABELS, VENDOR_TYPES, type VendorType } from "@/lib/validation/parties";

export type VendorListRow = {
  id: number;
  name: string;
  type: VendorType;
  phone: string;
  ntn: string;
  paymentCount: number;
  totalPaid: string; // decimal string
};

export function VendorsTable({ rows, currency, emptyText }: { rows: VendorListRow[]; currency: string; emptyText: string }) {
  const columns: ColumnDef<VendorListRow>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <SortHeader column={column} title="Name" />,
      cell: ({ row }) => (
        <Link href={`/vendors/${row.original.id}`} className="font-medium text-primary hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "type",
      filterFn: "arrIncludesSome",
      header: ({ column }) => <SortHeader column={column} title="Type" />,
      cell: ({ row }) => <Badge variant="neutral">{VENDOR_TYPE_LABELS[row.original.type]}</Badge>,
    },
    {
      accessorKey: "phone",
      enableSorting: false,
      header: "Phone",
      cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums">{row.original.phone}</span>,
    },
    {
      accessorKey: "ntn",
      enableSorting: false,
      header: "NTN",
      cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums">{row.original.ntn}</span>,
      meta: { className: "hidden lg:table-cell" },
    },
    {
      accessorKey: "paymentCount",
      header: ({ column }) => <SortHeader column={column} title="Payments" align="right" />,
      meta: { align: "right" },
    },
    {
      accessorKey: "totalPaid",
      sortingFn: (a, b) => Number(a.original.totalPaid) - Number(b.original.totalPaid),
      header: ({ column }) => <SortHeader column={column} title={`Total paid (${currency})`} align="right" />,
      cell: ({ row }) => formatAmount(row.original.totalPaid),
      meta: { align: "right" },
    },
    {
      id: "actions",
      enableSorting: false,
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const v = row.original;
        return (
          <RowActions
            label={v.name}
            actions={[
              { label: "View", icon: Eye, href: `/vendors/${v.id}` },
              { label: "Edit", icon: Pencil, href: `/vendors/${v.id}/edit` },
              "separator",
              { label: "All expenses", icon: Receipt, href: `/expenses?vendorId=${v.id}` },
            ]}
          />
        );
      },
      meta: { sticky: true },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyText={emptyText}
      facets={[{ columnId: "type", title: "Type", options: VENDOR_TYPES.map((t) => ({ value: t, label: VENDOR_TYPE_LABELS[t] })) }]}
      className="hidden sm:block"
    />
  );
}
