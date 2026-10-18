import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth";
import { listProjectOptions } from "@/server/services/project-service";
import { listLinkableUsers } from "@/server/services/worker-service";
import { createWorkerAction } from "../actions";
import { WorkerForm } from "../worker-form";

export const metadata = { title: "New employee" };

export default async function NewWorkerPage() {
  const actor = await requireRole("ADMIN", "ACCOUNTANT");
  const [projects, users] = await Promise.all([listProjectOptions(actor, { forNewExpense: true }), listLinkableUsers()]);
  return (
    <>
      <PageHeader title="New employee" description="A labourer, or a permanent / part-time staff member" />
      <WorkerForm action={createWorkerAction} projects={projects} users={users} cancelHref="/workers" />
    </>
  );
}
