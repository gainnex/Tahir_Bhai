import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth";
import { listSiteIncharges } from "@/server/services/project-service";
import { createProjectAction } from "../actions";
import { ProjectForm } from "../project-form";

export const metadata = { title: "New project" };

export default async function NewProjectPage() {
  await requireRole("ADMIN");
  const siteIncharges = await listSiteIncharges();
  return (
    <>
      <PageHeader title="New project" />
      <ProjectForm action={createProjectAction} siteIncharges={siteIncharges} cancelHref="/projects" />
    </>
  );
}
