import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/notice";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/server/auth";
import { listUsers } from "@/server/services/user-service";
import { UsersTable, type UserRow } from "./users-table";

export const metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: PageProps<"/settings/users">) {
  const actor = await requireRole("ADMIN");
  const users = await listUsers(actor);
  const { created } = await searchParams;

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    role: u.role,
    projects: u._count.projects,
    isActive: u.isActive,
    isSelf: u.id === actor.id,
  }));

  return (
    <>
      <PageHeader
        title="Users"
        description="Create users, set roles, reset passwords and deactivate accounts."
        actions={
          <Link href="/settings/users/new" className={buttonVariants()}>
            <Plus /> New user
          </Link>
        }
      />
      {created && (
        <Notice variant="success" className="mb-4">
          User created. They will be asked to choose their own password at first login.
        </Notice>
      )}
      <UsersTable rows={rows} />
    </>
  );
}
