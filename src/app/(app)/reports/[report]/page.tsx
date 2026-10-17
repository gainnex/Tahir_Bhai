import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSpreadsheet, FileText, Search } from "lucide-react";
import { Field } from "@/components/forms/field";
import { PageHeader } from "@/components/layout/page-header";
import { ReportView } from "@/components/report-view";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db";
import { todayPK } from "@/lib/format";
import { filtersToQuery, parseReportFilters, PERIOD_LABELS, REPORTS, type ReportFilters } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { pageData } from "@/server/params";
import { listProjectOptions } from "@/server/services/project-service";
import { buildReport } from "@/server/services/report-service";

type Slug = keyof typeof REPORTS;

export async function generateMetadata({ params }: PageProps<"/reports/[report]">) {
  const slug = (await params).report as Slug;
  return { title: REPORTS[slug]?.title ?? "Report" };
}

export default async function ReportPage({ params, searchParams }: PageProps<"/reports/[report]">) {
  const actor = await requireUser();
  const slug = (await params).report as Slug;
  const config = REPORTS[slug];
  if (!config) notFound();
  const sp = await searchParams;
  const f: ReportFilters = parseReportFilters(sp, config.defaultPeriod, todayPK());

  const [report, projects, heads, workers, vendors] = await Promise.all([
    pageData(buildReport(actor, slug, f)),
    listProjectOptions(actor),
    config.filters.includes("head")
      ? db.expenseHead.findMany({ select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
      : [],
    config.filters.includes("worker")
      ? db.worker.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [],
    config.filters.includes("vendor")
      ? db.vendor.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [],
  ]);
  const query = filtersToQuery(f);
  const canExport = !report.message;

  return (
    <>
      <PageHeader
        title={report.title}
        description={config.description}
        actions={
          canExport && (
            <>
              <a href={`/api/reports/${slug}?format=xlsx&${query}`} className={buttonVariants({ variant: "outline" })}>
                <FileSpreadsheet /> Excel
              </a>
              <a href={`/api/reports/${slug}?format=pdf&${query}`} className={buttonVariants({ variant: "outline" })}>
                <FileText /> PDF
              </a>
            </>
          )
        }
      />

      {/* Period presets keep the other filters (tabs look; each preset is a URL) */}
      <nav
        aria-label="Report period"
        className="mb-3 inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-lg bg-muted p-[3px] text-muted-foreground"
      >
        {(Object.keys(PERIOD_LABELS) as (keyof typeof PERIOD_LABELS)[]).map((p) => (
          <Link
            key={p}
            href={`/reports/${slug}?${filtersToQuery({ ...f, period: p, from: undefined, to: undefined })}`}
            aria-current={f.period === p ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors hover:text-foreground",
              f.period === p && "bg-background text-foreground shadow-sm",
            )}
          >
            {PERIOD_LABELS[p]}
          </Link>
        ))}
      </nav>

      <Card className="mb-4 py-3 sm:py-4">
        <CardContent className="px-3 sm:px-4">
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" role="search">
            <Field label="From">
              <DatePicker name="from" defaultValue={f.from ?? ""} placeholder="Any date" clearable />
            </Field>
            <Field label="To">
              <DatePicker name="to" defaultValue={f.to ?? ""} placeholder="Any date" clearable />
            </Field>
            <Field label={config.projectRequired ? "Project *" : "Project"} className="lg:col-span-2">
              <Combobox
                name="projectId"
                defaultValue={f.projectId ? String(f.projectId) : ""}
                clearLabel={config.projectRequired ? undefined : "All projects"}
                placeholder={config.projectRequired ? "Select a project…" : "All projects"}
                searchPlaceholder="Search projects…"
                options={projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))}
              />
            </Field>
            {config.filters.includes("head") && (
              <Field label="Head">
                <Combobox
                  name="headId"
                  defaultValue={f.headId ? String(f.headId) : ""}
                  clearLabel="All heads"
                  placeholder="All heads"
                  searchPlaceholder="Search heads…"
                  options={heads.map((h) => ({ value: String(h.id), label: h.name }))}
                />
              </Field>
            )}
            {config.filters.includes("worker") && (
              <Field label="Worker">
                <Combobox
                  name="workerId"
                  defaultValue={f.workerId ? String(f.workerId) : ""}
                  clearLabel="All workers"
                  placeholder="All workers"
                  searchPlaceholder="Search workers…"
                  options={workers.map((w) => ({ value: String(w.id), label: w.name }))}
                />
              </Field>
            )}
            {config.filters.includes("vendor") && (
              <Field label="Vendor">
                <Combobox
                  name="vendorId"
                  defaultValue={f.vendorId ? String(f.vendorId) : ""}
                  clearLabel="All vendors"
                  placeholder="All vendors"
                  searchPlaceholder="Search vendors…"
                  options={vendors.map((v) => ({ value: String(v.id), label: v.name }))}
                />
              </Field>
            )}
            <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-6">
              <Label className="flex h-9 cursor-pointer items-center gap-2 text-sm font-normal">
                <Checkbox name="pending" value="1" defaultChecked={f.includePending} />
                Include pending expenses
              </Label>
              {/* Keep the preset when no custom dates are typed */}
              {f.period !== "custom" && <input type="hidden" name="period" value={f.period} />}
              <Button type="submit" variant="secondary">
                <Search /> Show report
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="mb-4 text-sm text-muted-foreground">{report.subtitle}</p>
      <ReportView report={report} />
    </>
  );
}
