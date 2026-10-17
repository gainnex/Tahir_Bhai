"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type OnChangeFn,
  type Row,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { DataTableFacetedFilter, type FacetOption } from "./faceted-filter";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match the library's
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Right-align (money, counts) with tabular figures. */
    align?: "right";
    /** Extra classes on both <th> and <td>, e.g. responsive "hidden md:table-cell". */
    className?: string;
    /** Pin to the right edge while scrolling horizontally (row actions). */
    sticky?: boolean;
    /** Footer cell content (totals row). */
    footer?: React.ReactNode;
  }
}

export type DataTableFacet = { columnId: string; title: string; options: FacetOption[] };

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Shown when there are no rows at all / when filters hide every row. */
  emptyText?: React.ReactNode;
  /** Client-side text search across all columns. */
  searchPlaceholder?: string;
  /** Client-side status-style facet filters (popover with checkboxes + count badges). */
  facets?: DataTableFacet[];
  /** Extra controls on the right of the toolbar. */
  toolbar?: React.ReactNode;
  initialSorting?: SortingState;
  /** Server-side sorting (rows already sorted by the server; state lives in the URL). */
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  /** Render a totals row from each column's `meta.footer`. */
  showFooter?: boolean;
  rowClassName?: (row: Row<TData>) => string | undefined;
  className?: string;
};

/**
 * shadcn <Table> driven by @tanstack/react-table. Bordered card surface, horizontal scroll on
 * small screens, sticky actions column, optional toolbar (search + facet filters).
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  emptyText = "No results.",
  searchPlaceholder,
  facets,
  toolbar,
  initialSorting = [],
  sorting: controlledSorting,
  onSortingChange,
  showFooter,
  rowClassName,
  className,
}: DataTableProps<TData, TValue>) {
  const [innerSorting, setInnerSorting] = React.useState<SortingState>(initialSorting);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const manual = controlledSorting !== undefined;

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is not memo-safe; this component does not use React Compiler memoization
  const table = useReactTable({
    data,
    columns,
    state: { sorting: controlledSorting ?? innerSorting, globalFilter, columnFilters },
    manualSorting: manual,
    onSortingChange: onSortingChange ?? setInnerSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: manual ? undefined : getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    globalFilterFn: "includesString",
  });

  const filtered = globalFilter !== "" || columnFilters.length > 0;
  const hasToolbar = !!searchPlaceholder || !!facets?.length || !!toolbar;
  const rows = table.getRowModel().rows;

  return (
    <div className={cn("space-y-3", className)}>
      {hasToolbar && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {searchPlaceholder && (
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-8 bg-card pl-8"
                  aria-label="Search table"
                />
              </div>
            )}
            {facets?.map((f) => {
              const column = table.getColumn(f.columnId);
              return column ? (
                <DataTableFacetedFilter key={f.columnId} column={column} title={f.title} options={f.options} />
              ) : null;
            })}
            {filtered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setGlobalFilter("");
                  setColumnFilters([]);
                }}
              >
                Reset <X />
              </Button>
            )}
          </div>
          {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border/60 bg-card shadow-xs">
        <Table>
          <TableHeader className="bg-muted/60">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => {
                  const meta = h.column.columnDef.meta;
                  return (
                    <TableHead
                      key={h.id}
                      className={cn(
                        "h-10 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
                        meta?.align === "right" && "text-right",
                        meta?.sticky && stickyCell("bg-muted"),
                        meta?.className,
                      )}
                    >
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-24 text-center whitespace-normal text-muted-foreground">
                  {filtered ? "No rows match the search / filters." : emptyText}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className={cn("group/row", rowClassName?.(row))}>
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "px-3 py-2.5",
                          meta?.align === "right" && "num font-mono text-[13px]",
                          meta?.sticky && stickyCell("bg-card group-hover/row:bg-muted"),
                          meta?.className,
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
          {showFooter && rows.length > 0 && (
            <TableFooter className="border-t-2 bg-muted/60 font-semibold">
              <TableRow className="hover:bg-transparent">
                {table.getVisibleLeafColumns().map((col) => (
                  <TableCell
                    key={col.id}
                    className={cn(
                      "px-3 py-2.5",
                      col.columnDef.meta?.align === "right" && "num font-mono text-[13px]",
                      col.columnDef.meta?.sticky && stickyCell("bg-muted"),
                      col.columnDef.meta?.className,
                    )}
                  >
                    {col.columnDef.meta?.footer}
                  </TableCell>
                ))}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}

function stickyCell(bg: string) {
  return cn("sticky right-0 z-10 w-12 shadow-[inset_1px_0_0_var(--color-border)]", bg);
}
