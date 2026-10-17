"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil } from "lucide-react";
import { SortHeader } from "@/components/data-table/column-header";
import { DataTable } from "@/components/data-table/data-table";
import { RowActions } from "@/components/data-table/row-actions";
import { ActiveBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/permissions";

export type UserRow = {
  id: number;
  name: string;
  username: string;
  email: string | null;
  role: Role;
  projects: number;
  isActive: boolean;
  isSelf: boolean;
};

const ROLE_VARIANT: Record<Role, "info" | "neutral" | "outline"> = {
  ADMIN: "info",
  ACCOUNTANT: "neutral",
  SITE_INCHARGE: "outline",
};

const columns: ColumnDef<UserRow>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <SortHeader column={column} title="Name" />,
    cell: ({ row }) => (
      <span>
        <Link href={`/settings/users/${row.original.id}`} className="font-medium text-primary hover:underline">
          {row.original.name}
        </Link>
        {row.original.isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
      </span>
    ),
  },
  {
    accessorKey: "username",
    header: ({ column }) => <SortHeader column={column} title="Username" />,
    cell: ({ row }) => <span className="font-mono text-[13px]">{row.original.username}</span>,
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => row.original.email ?? "",
    meta: { className: "hidden md:table-cell" },
  },
  {
    accessorKey: "role",
    header: ({ column }) => <SortHeader column={column} title="Role" />,
    filterFn: "arrIncludesSome",
    cell: ({ row }) => <Badge variant={ROLE_VARIANT[row.original.role]}>{ROLE_LABELS[row.original.role]}</Badge>,
  },
  {
    id: "projects",
    accessorFn: (r) => (r.role === "SITE_INCHARGE" ? r.projects : -1),
    header: ({ column }) => <SortHeader column={column} title="Projects" align="right" />,
    cell: ({ row }) => (row.original.role === "SITE_INCHARGE" ? row.original.projects : "All"),
    meta: { align: "right", className: "hidden sm:table-cell" },
  },
  {
    id: "status",
    accessorFn: (r) => (r.isActive ? "active" : "inactive"),
    header: "Status",
    filterFn: "arrIncludesSome",
    cell: ({ row }) => <ActiveBadge active={row.original.isActive} />,
  },
  {
    id: "actions",
    enableSorting: false,
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <RowActions
        label={`@${row.original.username}`}
        actions={[{ label: "Edit user", icon: Pencil, href: `/settings/users/${row.original.id}` }]}
      />
    ),
    meta: { sticky: true },
  },
];

export function UsersTable({ rows }: { rows: UserRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyText="No users yet."
      searchPlaceholder="Search name, username, email…"
      facets={[
        { columnId: "role", title: "Role", options: ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })) },
        {
          columnId: "status",
          title: "Status",
          options: [
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ],
        },
      ]}
    />
  );
}
