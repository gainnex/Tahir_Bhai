import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth";
import { listHeadTree } from "@/server/services/head-service";
import { AddHeadForm, HeadTree } from "./heads-tree";

export const metadata = { title: "Expense heads" };

export default async function HeadsPage() {
  await requireRole("ADMIN");
  const tree = await listHeadTree();
  const heads = tree.map((h) => ({
    id: h.id,
    name: h.name,
    isActive: h.isActive,
    expenseCount: h._count.expenses,
    subheads: h.subheads.map((s) => ({
      id: s.id,
      name: s.name,
      isActive: s.isActive,
      expenseCount: s._count.expenses,
    })),
  }));

  return (
    <>
      <PageHeader
        title="Expense heads"
        description="Disabled heads and sub-heads stay on old expenses but cannot be chosen for new ones. They cannot be deleted."
        actions={<AddHeadForm />}
      />
      <HeadTree heads={heads} />
    </>
  );
}
