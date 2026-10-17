import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { BudgetBar } from "@/components/budget-bar";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/notice";
import { ProjectStatusBadge } from "@/components/status-badges";
import { Button, buttonVariants } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { formatPKR } from "@/lib/format";
import { can } from "@/lib/permissions";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, type ProjectStatus } from "@/lib/validation/projects";
import { requireUser } from "@/server/auth";
import { listProjects } from "@/server/services/project-service";
import { getSettings } from "@/server/services/settings-service";
import { ProjectsTable, type ProjectListRow } from "./projects-table";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const actor = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = PROJECT_STATUSES.includes(sp.status as ProjectStatus) ? (sp.status as ProjectStatus) : undefined;

  const [projects, settings] = await Promise.all([listProjects(actor, { q, status }), getSettings()]);
  const canManage = can.manageProjects(actor.role);
  const cur = settings.currencyLabel;

  const rows: ProjectListRow[] = projects.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    clientName: p.clientName,
    location: p.location,
    status: p.status,
    budget: p.budget ? p.budget.toString() : null,
    spent: p.spent.toString(),
    usage: p.usage,
  }));

  return (
    <>
      <PageHeader
        title="Projects"
        description={can.seeAllProjects(actor.role) ? "All projects and cost centers" : "Projects assigned to you"}
        actions={
          canManage && (
            <Link href="/projects/new" className={buttonVariants()}>
              <Plus /> New project
            </Link>
          )
        }
      />
      {sp.deleted && (
        <Notice variant="success" className="mb-4">
          Project deleted.
        </Notice>
      )}

      {/* Server-side filters (?q= & ?status=, bookmarkable). Phones use this form; on larger
          screens the table toolbar searches/filters the rows in place. */}
      <form className="mb-4 flex flex-col gap-2 sm:hidden" role="search">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search code, name, client or location" className="pl-8" />
        </div>
        <Combobox
          name="status"
          defaultValue={status ?? ""}
          clearLabel="All statuses"
          placeholder="All statuses"
          options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] }))}
        />
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" className="flex-1">
            <Search /> Filter
          </Button>
          {(q || status) && (
            <Link href="/projects" className={buttonVariants({ variant: "ghost" })}>
              Clear
            </Link>
          )}
        </div>
      </form>
      {(q || status) && (
        <Notice variant="info" className="mb-4 hidden sm:grid">
          Showing projects filtered by{" "}
          {[q && `“${q}”`, status && PROJECT_STATUS_LABELS[status]].filter(Boolean).join(" · ")}.{" "}
          <Link href="/projects" className="font-medium underline underline-offset-4">
            Show all
          </Link>
        </Notice>
      )}

      {/* Phones: one card per project */}
      <div className="space-y-3 sm:hidden">
        {projects.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No projects found.</p>}
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="block rounded-lg border border-border/60 bg-card p-4 shadow-xs active:bg-muted"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-primary">{p.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{p.code}</div>
              </div>
              <ProjectStatusBadge status={p.status} />
            </div>
            <div className="mt-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Spent</span>
              <span className="font-mono font-medium tabular-nums">{formatPKR(p.spent, cur)}</span>
            </div>
            {p.budget && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Budget</span>
                <span className="font-mono tabular-nums">{formatPKR(p.budget, cur)}</span>
              </div>
            )}
            <div className="mt-2">
              <BudgetBar usage={p.usage} />
            </div>
          </Link>
        ))}
      </div>

      <ProjectsTable
        rows={rows}
        currency={cur}
        canManage={canManage}
        emptyText={q || status ? "No projects match these filters." : "No projects yet."}
        className="hidden sm:block"
      />
    </>
  );
}
