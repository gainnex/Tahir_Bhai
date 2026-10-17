import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth";
import { listProjectOptions } from "@/server/services/project-service";
import { createWorkerAction } from "../actions";
import { WorkerForm } from "../worker-form";

export const metadata = { title: "New worker" };

export default async function NewWorkerPage() {
  const actor = await requireRole("ADMIN", "ACCOUNTANT");
  const projects = await listProjectOptions(actor, { forNewExpense: true });
  return (
    <>
      <PageHeader title="New worker" />
      <WorkerForm action={createWorkerAction} projects={projects} cancelHref="/workers" />
    </>
  );
}
