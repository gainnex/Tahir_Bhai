import Link from "next/link";
import { Clock, ListChecks, Pencil, Wallet } from "lucide-react";
import { ExpenseMiniTable } from "@/components/expense-mini-table";
import { Kpi } from "@/components/kpi";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPKR, plural } from "@/lib/format";
import { VENDOR_TYPE_LABELS } from "@/lib/validation/parties";
import { requireRole } from "@/server/auth";
import { pageData, parseId } from "@/server/params";
import { getSettings } from "@/server/services/settings-service";
import { getVendorProfile } from "@/server/services/vendor-service";

export const metadata = { title: "Vendor" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 border-b border-border/60 py-2.5 text-sm last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export default async function VendorProfilePage({ params }: PageProps<"/vendors/[id]">) {
  const actor = await requireRole("ADMIN", "ACCOUNTANT");
  const id = parseId((await params).id);
  const [p, settings] = await Promise.all([pageData(getVendorProfile(actor, id)), getSettings()]);
  const { vendor } = p;
  const cur = settings.currencyLabel;
  const none = <span className="text-muted-foreground">—</span>;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {vendor.name} <Badge variant="neutral">{VENDOR_TYPE_LABELS[vendor.type]}</Badge>
          </span>
        }
        description={[vendor.phone, vendor.ntn && `NTN ${vendor.ntn}`, vendor.address].filter(Boolean).join(" · ")}
        actions={
          <Link href={`/vendors/${vendor.id}/edit`} className={buttonVariants({ variant: "outline" })}>
            <Pencil /> Edit
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Total paid"
          icon={Wallet}
          value={formatPKR(p.totalPaid, cur)}
          sub={`${plural(p.approvedCount, "approved payment")}`}
        />
        <Kpi
          label="Pending approval"
          icon={Clock}
          tone={p.pendingCount > 0 ? "warning" : undefined}
          value={formatPKR(p.pendingAmount, cur)}
          sub={`${plural(p.pendingCount, "expense")} — not counted yet`}
        />
        <Kpi label="All entries" icon={ListChecks} value={p.entryCount} sub="Including pending and rejected" />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Contact &amp; payment details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl>
            <Row label="Type">{VENDOR_TYPE_LABELS[vendor.type]}</Row>
            <Row label="Phone">{vendor.phone ? <span className="font-mono tabular-nums">{vendor.phone}</span> : none}</Row>
            <Row label="NTN">{vendor.ntn ? <span className="font-mono tabular-nums">{vendor.ntn}</span> : none}</Row>
            <Row label="Address">{vendor.address ? <span className="whitespace-pre-line">{vendor.address}</span> : none}</Row>
            {vendor.notes && (
              <Row label="Notes">
                <span className="whitespace-pre-line text-muted-foreground">{vendor.notes}</span>
              </Row>
            )}
          </dl>
        </CardContent>
      </Card>

      <div className="mt-8 mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Payments</h2>
        {p.entryCount > p.entries.length && (
          <Link href={`/expenses?vendorId=${vendor.id}`} className="text-sm text-primary hover:underline">
            All {p.entryCount} entries →
          </Link>
        )}
      </div>
      <ExpenseMiniTable rows={p.entries} currency={cur} empty="No expenses paid to this vendor yet." />
    </>
  );
}
