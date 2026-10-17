"use client";

import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Sortable column header: click to cycle asc → desc → off. */
export function SortHeader<TData, TValue>({
  column,
  title,
  align,
}: {
  column: Column<TData, TValue>;
  title: string;
  align?: "right";
}) {
  if (!column.getCanSort()) return <span>{title}</span>;
  const dir = column.getIsSorted();
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn(
        "-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 uppercase hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        align === "right" && "flex-row-reverse",
        dir && "text-foreground",
      )}
      aria-label={`Sort by ${title}`}
    >
      {title}
      <Icon className={cn("size-3.5", !dir && "opacity-40")} />
    </button>
  );
}
