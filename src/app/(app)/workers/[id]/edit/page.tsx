import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth";
import { pageData, parseId } from "@/server/params";
import { listProjectOptions } from "@/server/services/project-service";
import { getWorkerForEdit, listLinkableUsers } from "@/server/services/worker-service";
import { deleteWorkerAction, updateWorkerAction } from "../../actions";
import { WorkerForm } from "../../worker-form";

export const metadata = { title: "Edit employee" };

export default async function EditWorkerPage({ params }: PageProps<"/workers/[id]/edit">) {
  const actor = await requireRole("ADMIN", "ACCOUNTANT");
  const id = parseId((await params).id);
  const [w, projects, users] = await Promise.all([
    pageData(getWorkerForEdit(actor, id)),
    listProjectOptions(actor),
    listLinkableUsers(id),
  ]);
  return (
    <>
      <PageHeader title={`Edit ${w.name}`} />
      <WorkerForm
        action={updateWorkerAction.bind(null, id)}
        deleteAction={deleteWorkerAction.bind(null, id)}
        projects={projects}
        users={users}
        cancelHref={`/workers/${id}`}
        values={{
          name: w.name,
          cnic: w.cnic ?? "",
          phone: w.phone ?? "",
          employeeType: w.employeeType,
          designation: w.designation ?? "",
          userId: w.userId,
          trade: w.trade,
          rateType: w.rateType,
          rate: w.rate.toFixed(2).replace(/\.00$/, ""),
          defaultProjectId: w.defaultProjectId,
          isActive: w.isActive,
        }}
      />
    </>
  );
}
