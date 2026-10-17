"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { Check, Eye, Paperclip, Pencil, Split, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { SortHeader } from "@/components/data-table/column-header";
import { DataTable } from "@/components/data-table/data-table";
import { RowActions, type RowAction } from "@/components/data-table/row-actions";
import { ExpenseStatusBadge } from "@/components/status-badges";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAmount, formatDate } from "@/lib/format";
import { EXPENSE_SORTS, PAYMENT_MODE_LABELS, type ExpenseSort, type PaymentMode } from "@/lib/validation/expenses";
import { approveExpenseAction, deleteExpenseAction } from "./actions";

export type ExpenseListRow = {
  id: number;
  expenseNo: string;
  date: string; // ISO
  amount: string; // decimal string
  paidTo: string;
  description: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  paymentMode: PaymentMode;
  projectCode: string;
  projectName: string;
  head: string;
  subhead: string;
  isSplit: boolean;
  attachments: number;
  canEdit: boolean;
  canApprove: boolean;
};

function toSorting(sort: string | undefined): SortingState {
  if (!sort) return [];
  return [{ id: sort.replace(/^-/, ""), desc: sort.startsWith("-") }];
}

export function ExpensesTable({
  rows,
  currency,
  sort,
  emptyText,
}: {
  rows: ExpenseListRow[];
  currency: string;
  sort?: ExpenseSort;
  emptyText: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [busy, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<ExpenseListRow | null>(null);
  const sorting = toSorting(sort);

  // Sorting is done by the server (the list is paginated), so it lives in the URL.
  function onSortingChange(updater: SortingState | ((old: SortingState) => SortingState)) {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    const s = next[0] ? `${next[0].desc ? "-" : ""}${next[0].id}` : "";
    if (s && EXPENSE_SORTS.includes(s as ExpenseSort)) params.set("sort", s);
    else params.delete("sort");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function approve(r: ExpenseListRow) {
    start(async () => {
      const res = await approveExpenseAction(r.id);
      if (res.ok) toast.success(res.message ?? "Expense approved.");
      else toast.error(res.error ?? "Could not approve.");
    });
  }

  const columns: ColumnDef<ExpenseListRow>[] = [
    {
      id: "date",
      accessorKey: "date",
      header: ({ column }) => <SortHeader column={column} title="Date" />,
      cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums">{formatDate(row.original.date)}</span>,
    },
    {
      id: "expenseNo",
      accessorKey: "expenseNo",
      header: ({ column }) => <SortHeader column={column} title="No." />,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1">
          <Link href={`/expenses/${row.original.id}`} className="font-mono text-xs text-primary hover:underline">
            {row.original.expenseNo}
          </Link>
          {row.original.isSplit && <Split className="size-3 text-muted-foreground" aria-label="Split bill" />}
          {row.original.attachments > 0 && <Paperclip className="size-3 text-muted-foreground" aria-label="Has receipt" />}
        </span>
      ),
    },
    {
      id: "project",
      enableSorting: false,
      header: "Project",
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default font-mono text-xs">{row.original.projectCode}</span>
          </TooltipTrigger>
          <TooltipContent>{row.original.projectName}</TooltipContent>
        </Tooltip>
      ),
    },
    {
      id: "head",
      enableSorting: false,
      header: "Head / Sub-head",
      cell: ({ row }) => (
        <span>
          {row.original.head} <span className="text-muted-foreground">/ {row.original.subhead}</span>
        </span>
      ),
    },
    {
      id: "paidTo",
      accessorKey: "paidTo",
      header: ({ column }) => <SortHeader column={column} title="Paid to" />,
      cell: ({ row }) => (
        <span className="block max-w-48 truncate" title={row.original.description}>
          {row.original.paidTo}
        </span>
      ),
    },
    {
      id: "mode",
      enableSorting: false,
      header: "Mode",
      cell: ({ row }) => PAYMENT_MODE_LABELS[row.original.paymentMode],
      meta: { className: "hidden 2xl:table-cell" },
    },
    {
      id: "amount",
      accessorKey: "amount",
      header: ({ column }) => <SortHeader column={column} title={`Amount (${currency})`} align="right" />,
      cell: ({ row }) => formatAmount(row.original.amount),
      meta: { align: "right" },
    },
    {
      id: "status",
      enableSorting: false,
      header: "Status",
      cell: ({ row }) => <ExpenseStatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      enableSorting: false,
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const r = row.original;
        const actions: RowAction[] = [{ label: "View", icon: Eye, href: `/expenses/${r.id}` }];
        if (r.canEdit)
          actions.push({ label: r.status === "REJECTED" ? "Edit & resubmit" : "Edit", icon: Pencil, href: `/expenses/${r.id}/edit` });
        if (r.canApprove) {
          actions.push("separator");
          actions.push({ label: r.isSplit ? "Approve bill" : "Approve", icon: Check, onSelect: () => approve(r), disabled: busy });
          // A rejection needs a reason, given on the expense page next to the receipt
          actions.push({ label: "Reject…", icon: X, href: `/expenses/${r.id}` });
        }
        if (r.canEdit) {
          actions.push("separator");
          actions.push({ label: "Delete", icon: Trash2, destructive: true, onSelect: () => setConfirmDelete(r) });
        }
        return <RowActions label={r.expenseNo} actions={actions} />;
      },
      meta: { sticky: true },
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        emptyText={emptyText}
        sorting={sorting}
        onSortingChange={onSortingChange}
        className="hidden sm:block"
      />
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.expenseNo}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.isSplit
                ? "This deletes the whole split bill (every line)."
                : "It will no longer count anywhere."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => {
                const r = confirmDelete;
                if (!r) return;
                start(async () => {
                  const res = await deleteExpenseAction(r.id); // redirects on success
                  if (res?.error) toast.error(res.error);
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
