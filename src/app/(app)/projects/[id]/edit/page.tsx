import { PageHeader } from "@/components/layout/page-header";
import { toInputDate } from "@/lib/format";
import { requireRole } from "@/server/auth";
import { pageData, parseId } from "@/server/params";
import { getProjectForEdit, listSiteIncharges } from "@/server/services/project-service";
import { deleteProjectAction, updateProjectAction } from "../../actions";
import { ProjectForm } from "../../project-form";

export const metadata = { title: "Edit project" };

export default async function EditProjectPage({ params }: PageProps<"/projects/[id]/edit">) {
  const actor = await requireRole("ADMIN");
  const id = parseId((await params).id);
  const [project, siteIncharges] = await Promise.all([
    pageData(getProjectForEdit(actor, id)),
    listSiteIncharges(),
  ]);

  return (
    <>
      <PageHeader title={`Edit ${project.name}`} description={project.code} />
      <ProjectForm
        action={updateProjectAction.bind(null, id)}
        deleteAction={deleteProjectAction.bind(null, id)}
        siteIncharges={siteIncharges}
        cancelHref={`/projects/${id}`}
        values={{
          code: project.code,
          name: project.name,
          clientName: project.clientName ?? "",
          projectManager: project.projectManager ?? "",
          location: project.location ?? "",
          startDate: toInputDate(project.startDate),
          endDate: toInputDate(project.endDate),
          status: project.status,
          budget: project.budget ? project.budget.toFixed(2).replace(/\.00$/, "") : "",
          notes: project.notes ?? "",
          siteInchargeIds: project.users.map((u) => u.userId),
          isHeadOffice: project.isHeadOffice,
        }}
      />
    </>
  );
}
