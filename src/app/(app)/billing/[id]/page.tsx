import Link from "next/link";
import { FileText, Pencil, Plus, Printer } from "lucide-react";
import { ActivityChanges } from "@/components/activity-changes";
import { DeleteButton } from "@/components/forms/delete-button";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/notice";
import { BillStateBadge } from "@/components/status-badges";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount, formatDate, formatDateTime, formatPKR, toInputDate, todayPK } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PAYMENT_MODE_LABELS } from "@/lib/validation/expenses";
import { requireRole } from "@/server/auth";
import { pageData, parseId } from "@/server/params";
import { namesForChanges } from "@/server/services/activity-service";
import { getBill } from "@/server/services/billing-service";
import { getSettings } from "@/server/services/settings-service";
import { unverifyBillAction, verifyBillAction } from "../actions";
import { VerifyForm } from "../billing-forms";

export const metadata = { title: "Client bill" };

const ACTION_LABEL = { CREATE: "Created", UPDATE: "Edited", DELETE: "Deleted", APPROVE: "Verified", REJECT: "Rejected", LOGIN: "Login" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-border/60 py-2.5 text-sm last:border-0 sm:grid-cols-[10rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export default async function BillPage({ params, searchParams }: PageProps<"/billing/[id]">) {
  const actor = await requireRole("ADMIN", "ACCOUNTANT");
  const id = parseId((await params).id);
  const sp = await searchParams;
  const [{ bill, totals, history }, settings] = await Promise.all([pageData(getBill(actor, id)), getSettings()]);
  const names = await namesForChanges(history.map((h) => h.changes));
  const cur = settings.currencyLabel;
  const num = "text-right font-mono tabular-nums";
  const verified = bill.status === "VERIFIED";
  const newReceipt = typeof sp.receipt === "string" ? bill.receipts.find((r) => String(r.id) === sp.receipt) : undefined;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {bill.billNo} <BillStateBadge state={totals.state} />
          </span>
        }
        description={`${bill.project.code} ${bill.project.name}${bill.project.clientName ? ` · ${bill.project.clientName}` : ""} · ${formatDate(bill.date)}`}
        actions={
          <>
            {verified && totals.outstanding?.isPositive() && (
              <Link href={`/billing/${bill.id}/receipts/new`} className={buttonVariants()}>
                <Plus /> Record receipt
              </Link>
            )}
            <a href={`/api/billing/bills/${bill.id}`} target="_blank" className={buttonVariants({ variant: "outline" })}>
              <Printer /> Print bill
            </a>
            <Link href={`/billing/${bill.id}/edit`} className={buttonVariants({ variant: "outline" })}>
              <Pencil /> Edit
            </Link>
          </>
        }
      />
      {typeof sp.saved === "string" && (
        <Notice variant="success" className="mb-4">
          Saved {sp.saved}. When the client has checked it, record the verified amount below.
        </Notice>
      )}
      {newReceipt && (
        <Notice variant="success" className="mb-4">
          <span>
            Receipt {newReceipt.receiptNo} saved —{" "}
            <a href={`/api/billing/receipts/${newReceipt.id}`} target="_blank" className="font-medium underline underline-offset-4">
              print the receipt
            </a>
          </span>
        </Notice>
      )}
      {sp.receiptDeleted && (
        <Notice variant="success" className="mb-4">
          Receipt deleted.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardContent>
              <dl>
                <Row label="Project">
                  <Link href={`/projects/${bill.project.id}`} className="text-primary hover:underline">
                    {bill.project.code} — {bill.project.name}
                  </Link>
                </Row>
                {bill.project.clientName && <Row label="Client">{bill.project.clientName}</Row>}
                {bill.clientRef && <Row label="Client reference">{bill.clientRef}</Row>}
                <Row label="Description">
                  <span className="whitespace-pre-line">{bill.description}</span>
                </Row>
                <Row label="Claimed">
                  <span className="font-mono font-semibold tabular-nums">{formatPKR(bill.claimedAmount, cur)}</span>
                </Row>
                {verified && (
                  <>
                    <Row label="Verified amount">
                      <span className="font-mono font-semibold tabular-nums">{formatPKR(bill.approvedAmount!, cur)}</span>
                      {bill.approvedAmount!.lt(bill.claimedAmount) && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {formatPKR(bill.claimedAmount.minus(bill.approvedAmount!), cur)} cut by the client
                        </span>
                      )}
                    </Row>
                    <Row label="Verified on">{formatDate(bill.verifiedDate)}</Row>
                    {bill.verificationNote && <Row label="Verification note">{bill.verificationNote}</Row>}
                    <Row label="Received">
                      <span className="font-mono tabular-nums">{formatPKR(totals.received, cur)}</span>
                      {!totals.taxDeducted.isZero() && (
                        <span className="text-muted-foreground"> + {formatPKR(totals.taxDeducted, cur)} tax deducted</span>
                      )}
                    </Row>
                    <Row label="Receivable">
                      <span className="font-mono font-semibold tabular-nums">{formatPKR(totals.outstanding!, cur)}</span>
                    </Row>
                  </>
                )}
                <Row label="Entered by">
                  {bill.createdBy.name} · <span className="font-mono text-xs tabular-nums">{formatDateTime(bill.createdAt)}</span>
                </Row>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{verified ? "Client verification" : "Record the client's verification"}</CardTitle>
              <CardDescription>
                {verified
                  ? "Correct the verified amount if the client revises it. It cannot go below what has been received."
                  : "Enter the amount the client approved after checking the bill (it may be less than claimed). Payments can be received once the bill is verified."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <VerifyForm
                action={verifyBillAction.bind(null, bill.id)}
                claimed={bill.claimedAmount.toFixed(2)}
                currency={cur}
                values={{
                  approvedAmount: (bill.approvedAmount ?? bill.claimedAmount).toFixed(2).replace(/\.00$/, ""),
                  verifiedDate: bill.verifiedDate ? toInputDate(bill.verifiedDate) : todayPK(),
                  verificationNote: bill.verificationNote ?? "",
                }}
              />
              {verified && bill.receipts.length === 0 && (
                <DeleteButton
                  action={unverifyBillAction.bind(null, bill.id)}
                  label="Undo verification"
                  title="Undo verification?"
                  confirmText="Set this bill back to Claimed? The verified amount is removed (the change is logged)."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Receipts</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Date</TableHead>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Tax deducted</TableHead>
                    <TableHead className="pr-6" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bill.receipts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                        {verified ? "No payments received yet." : "Receipts can be recorded once the bill is verified."}
                      </TableCell>
                    </TableRow>
                  )}
                  {bill.receipts.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="pl-6 font-mono text-xs tabular-nums">{formatDate(r.date)}</TableCell>
                      <TableCell>
                        <Link href={`/billing/receipts/${r.id}/edit`} className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline">
                          {r.receiptNo} <Pencil className="size-3" />
                        </Link>
                        {r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {PAYMENT_MODE_LABELS[r.paymentMode]}
                        {r.referenceNo && <span className="text-muted-foreground"> · {r.referenceNo}</span>}
                      </TableCell>
                      <TableCell className={num}>{formatAmount(r.amount)}</TableCell>
                      <TableCell className={num}>{r.taxDeducted ? formatAmount(r.taxDeducted) : "—"}</TableCell>
                      <TableCell className="pr-6 text-right">
                        <a href={`/api/billing/receipts/${r.id}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <FileText className="size-3.5" /> PDF
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {bill.receipts.length > 1 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3} className="pl-6 font-semibold">
                        Total
                      </TableCell>
                      <TableCell className={cn(num, "font-semibold")}>{formatAmount(totals.received)}</TableCell>
                      <TableCell className={cn(num, "font-semibold")}>{formatAmount(totals.taxDeducted)}</TableCell>
                      <TableCell className="pr-6" />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-4 border-l border-border/80 pl-4">
              {history.map((h) => (
                <li key={h.id} className="relative text-sm">
                  <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card bg-primary/70" />
                  <div>
                    <span className="font-medium">
                      {h.entityType === "client_receipt" ? `Receipt ${ACTION_LABEL[h.action].toLowerCase()}` : ACTION_LABEL[h.action]}
                    </span>{" "}
                    by {h.user.name}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground tabular-nums">{formatDateTime(h.createdAt)}</div>
                  {h.action !== "CREATE" && (
                    <div className="mt-1">
                      <ActivityChanges changes={h.changes} compact names={names} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
