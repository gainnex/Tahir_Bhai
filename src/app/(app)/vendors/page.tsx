import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Field } from "@/components/forms/field";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { formatPKR } from "@/lib/format";
import { VENDOR_TYPE_LABELS, VENDOR_TYPES, type VendorType } from "@/lib/validation/parties";
import { requireRole } from "@/server/auth";
import { getSettings } from "@/server/services/settings-service";
import { listVendors } from "@/server/services/vendor-service";
import { VendorsTable, type VendorListRow } from "./vendors-table";

export const metadata = { title: "Vendors" };

export default async function VendorsPage({ searchParams }: PageProps<"/vendors">) {
  const actor = await requireRole("ADMIN", "ACCOUNTANT");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const type = VENDOR_TYPES.includes(sp.type as VendorType) ? (sp.type as VendorType) : undefined;
  const [vendors, settings] = await Promise.all([listVendors(actor, { q, type }), getSettings()]);
  const cur = settings.currencyLabel;

  const rows: VendorListRow[] = vendors.map((v) => ({
    id: v.id,
    name: v.name,
    type: v.type,
    phone: v.phone ?? "",
    ntn: v.ntn ?? "",
    paymentCount: v.paymentCount,
    totalPaid: v.totalPaid.toString(),
  }));

  return (
    <>
      <PageHeader
        title="Vendors / payees"
        description="Suppliers, contractors (thekedars) and other payees."
        actions={
          <Link href="/vendors/new" className={buttonVariants()}>
            <Plus /> New vendor
          </Link>
        }
      />
      {sp.deleted && (
        <Notice variant="success" className="mb-4">
          Vendor deleted.
        </Notice>
      )}

      {/* GET form, so filtered views can be bookmarked/shared */}
      <Card className="mb-4 py-3 sm:py-4">
        <CardContent className="px-3 sm:px-4">
          <form role="search" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Search" htmlFor="q" className="sm:w-80">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="q" name="q" defaultValue={q} placeholder="Search name, phone or NTN" className="pl-8" />
              </div>
            </Field>
            <Field label="Type" className="sm:w-56">
              <Combobox
                name="type"
                defaultValue={type ?? ""}
                clearLabel="All types"
                placeholder="All types"
                options={VENDOR_TYPES.map((t) => ({ value: t, label: VENDOR_TYPE_LABELS[t] }))}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary">
                <Search /> Filter
              </Button>
              {(q || type) && (
                <Link href="/vendors" className={buttonVariants({ variant: "ghost" })}>
                  Clear
                </Link>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Phones: cards */}
      <div className="space-y-2 sm:hidden">
        {vendors.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No vendors found.</p>}
        {vendors.map((v) => (
          <Link
            key={v.id}
            href={`/vendors/${v.id}`}
            className="block rounded-lg border border-border/60 bg-card p-3 shadow-xs active:bg-muted"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-primary">{v.name}</span>
              <Badge variant="neutral">{VENDOR_TYPE_LABELS[v.type]}</Badge>
            </div>
            {v.phone && <div className="font-mono text-xs text-muted-foreground tabular-nums">{v.phone}</div>}
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-muted-foreground">Total paid</span>
              <span className="font-mono font-medium tabular-nums">{formatPKR(v.totalPaid, cur)}</span>
            </div>
          </Link>
        ))}
      </div>

      <VendorsTable rows={rows} currency={cur} emptyText={q || type ? "No vendors match these filters." : "No vendors yet."} />
    </>
  );
}
