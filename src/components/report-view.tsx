"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Info, Paperclip } from "lucide-react";
import { SortHeader } from "@/components/data-table/column-header";
import { DataTable } from "@/components/data-table/data-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatAmount, formatDate } from "@/lib/format";
import type { CellValue, Report, ReportColumn, ReportRow, ReportTable } from "@/lib/reports";
import { cn } from "@/lib/utils";

function display(col: ReportColumn, v: CellValue): string {
  if (v === null || v === undefined || v === "") return col.type === "money" ? "—" : "";
  if (col.type === "money") return formatAmount(String(v));
  if (col.type === "date") return formatDate(String(v));
  if (col.type === "percent") return `${v}%`;
  return String(v);
}

const NUMERIC = ["money", "int", "percent"];

function columnsFor(t: ReportTable, sortable: boolean): ColumnDef<ReportRow, CellValue>[] {
  return t.columns.map((c) => {
    const right = NUMERIC.includes(c.type);
    return {
      id: c.key,
      accessorFn: (r) => r.cells[c.key] ?? null,
      enableSorting: sortable,
      // Money is a decimal string: compare as numbers (sorting only, never displayed)
      sortingFn: right
        ? (a, b, id) => Number(a.getValue(id) ?? 0) - Number(b.getValue(id) ?? 0)
        : "alphanumeric",
      header: ({ column }) => <SortHeader column={column} title={c.label} align={right ? "right" : undefined} />,
      cell: ({ row }) => {
        const text = display(c, row.original.cells[c.key] ?? null);
        const href = row.original.links?.[c.key];
        if (href && text)
          return (
            <Link href={href} className="inline-flex items-center gap-1 text-primary hover:underline">
              {c.key === "receipts" && <Paperclip className="size-3" />}
              {text}
            </Link>
          );
        return text;
      },
      meta: {
        align: right ? "right" : undefined,
        className: cn(
          c.type === "text" && c.wide && "min-w-48 whitespace-normal",
          (c.type === "date" || c.key === "no") && "font-mono text-[13px] tabular-nums",
        ),
        footer: t.totals ? display(c, t.totals[c.key] ?? null).replace(/^—$/, "") : undefined,
      },
    };
  });
}

/** On-screen rendering of a Report (the same model the Excel/PDF exports use). */
export function ReportView({ report }: { report: Report }) {
  if (report.message)
    return (
      <Alert variant="info">
        <Info />
        <AlertDescription className="text-inherit">{report.message}</AlertDescription>
      </Alert>
    );
  return (
    <div className="space-y-8">
      {report.tables.map((t, ti) => {
        // Ledgers (running balance, brought-forward rows) must stay in their printed order
        const sortable =
          !t.rows.some((r) => r.emphasis) && !t.columns.some((c) => c.key === "running" || c.key === "balance");
        return (
          <section key={ti} className="space-y-2">
            {t.title && <h2 className="text-lg font-semibold">{t.title}</h2>}
            <DataTable
              columns={columnsFor(t, sortable)}
              data={t.rows}
              emptyText={t.empty ?? "No data."}
              showFooter={!!t.totals}
              rowClassName={(r) => (r.original.emphasis ? "bg-muted/60 font-semibold" : undefined)}
            />
          </section>
        );
      })}
    </div>
  );
}
