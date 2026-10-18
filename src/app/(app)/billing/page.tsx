import Link from "next/link";
import { BadgeCheck, Clock, FileText, Filter, HandCoins, Plus, Receipt } from "lucide-react";
import { Field } from "@/components/forms/field";
import { Kpi } from "@/components/kpi";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/notice";
import { BillStateBadge } from "@/components/status-badges";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount, formatDate, formatPKR, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BILL_STATUS_LABELS, BILL_STATUSES, type BillStatus } from "@/lib/validation/billing";
import { requireRole } from "@/server/auth";
import { billableProjects, listBills } from "@/server/services/billing-service";
import { getSettings } from "@/server/services/settings-service";

export const metadata = { title: "Client bills" };

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const actor = await requireRole("ADMIN", "ACCOUNTANT");
  const sp = await searchParams;
  const projectId = typeof sp.projectId === "string" && /^\d+$/.test(sp.projectId) ? Number(sp.projectId) : undefined;
  const status = BILL_STATUSES.includes(sp.status as BillStatus) ? (sp.status as BillStatus) : undefined;
  const q = typeof sp.q === "string" && sp.q.trim() ? sp.q.trim().slice(0, 100) : undefined;

  const [list, projects, settings] = await Promise.all([
    listBills(actor, { projectId, status, q }),
    billableProjects(),
    getSettings(),
  ]);
  const cur = settings.currencyLabel;
  const num = "text-right font-mono tabular-nums";

  return (
    <>
      <PageHeader
        title="Client bills"
        description="Running bills claimed from clients, the amounts they verified, and payments received"
        actions={
          <>
            <Link href={`/billing/new${projectId ? `?projectId=${projectId}` : ""}`} className={buttonVariants()}>
              <Plus /> New bill
            </Link>
            <Link href="/reports/profitability" className={buttonVariants({ variant: "outline" })}>
              <FileText /> Profitability
            </Link>
          </>
        }
      />
      {sp.deleted && (
        <Notice variant="success" className="mb-4">
          Bill deleted.
        </Notice>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Claimed" icon={Receipt} value={formatPKR(list.claimed, cur)} sub={plural(list.rows.length, "bill")} />
        <Kpi label="Verified" icon={BadgeCheck} value={formatPKR(list.approved, cur)} sub="Approved by clients" />
        <Kpi label="Received" icon={HandCoins} value={formatPKR(list.credited, cur)} sub="Incl. tax deducted by clients" />
        <Kpi
          label="Receivable"
          icon={Clock}
          tone={list.outstanding.isZero() ? undefined : "warning"}
          value={formatPKR(list.outstanding, cur)}
          sub={list.awaiting.length ? `${plural(list.awaiting.length, "bill")} awaiting verification` : "On verified bills"}
        />
      </div>

      <Card className="mb-4 py-3 sm:py-4">
        <CardContent className="px-3 sm:px-4">
          <form className="grid gap-3 sm:grid-cols-[1fr_12rem_1fr_auto] sm:items-end" role="search">
            <Field label="Project">
              <Combobox
                name="projectId"
                defaultValue={projectId ? String(projectId) : ""}
                clearLabel="All projects"
                placeholder="All projects"
                searchPlaceholder="Search projects…"
                options={projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}`, hint: p.clientName ?? undefined }))}
              />
            </Field>
            <Field label="Status">
              <Combobox
                name="status"
                defaultValue={status ?? ""}
                clearLabel="Any status"
                placeholder="Any status"
                options={BILL_STATUSES.map((s) => ({ value: s, label: BILL_STATUS_LABELS[s] }))}
              />
            </Field>
            <Field label="Search">
              <Input name="q" defaultValue={q ?? ""} placeholder="Bill no., client reference, description" />
            </Field>
            <Button type="submit" variant="secondary">
              <Filter /> Filter
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Bill</TableHead>
              <TableHead className="min-w-48">Project</TableHead>
              <TableHead className="text-right">Claimed</TableHead>
              <TableHead className="text-right">Verified</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Receivable</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No bills{projectId || status || q ? " match these filters" : " yet"}.
                </TableCell>
              </TableRow>
            )}
            {list.rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-mono text-xs whitespace-nowrap tabular-nums">{formatDate(b.date)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <Link href={`/billing/${b.id}`} className="font-mono text-xs text-primary hover:underline">
                    {b.billNo}
                  </Link>
                  {b.clientRef && <div className="text-xs text-muted-foreground">{b.clientRef}</div>}
                </TableCell>
                <TableCell>
                  <Link href={`/projects/${b.project.id}`} className="hover:underline">
                    {b.project.code} — {b.project.name}
                  </Link>
                  {b.project.clientName && <div className="text-xs text-muted-foreground">{b.project.clientName}</div>}
                </TableCell>
                <TableCell className={num}>{formatAmount(b.claimedAmount)}</TableCell>
                <TableCell className={num}>{b.totals.approved ? formatAmount(b.totals.approved) : "—"}</TableCell>
                <TableCell className={num}>{b.totals.credited.isZero() ? "—" : formatAmount(b.totals.credited)}</TableCell>
                <TableCell className={cn(num, "font-semibold")}>
                  {b.totals.outstanding ? formatAmount(b.totals.outstanding) : "—"}
                </TableCell>
                <TableCell>
                  <BillStateBadge state={b.totals.state} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {list.rows.length > 1 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="font-semibold">
                  Total
                </TableCell>
                <TableCell className={cn(num, "font-semibold")}>{formatAmount(list.claimed)}</TableCell>
                <TableCell className={cn(num, "font-semibold")}>{formatAmount(list.approved)}</TableCell>
                <TableCell className={cn(num, "font-semibold")}>{formatAmount(list.credited)}</TableCell>
                <TableCell className={cn(num, "font-semibold")}>{formatAmount(list.outstanding)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </>
  );
}
