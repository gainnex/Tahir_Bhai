import Link from "next/link";
import { Prisma } from "@prisma/client";
import { CircleCheck, Clock, Lock, Pencil, Split, XCircle } from "lucide-react";
import { ActivityChanges } from "@/components/activity-changes";
import { DeleteButton } from "@/components/forms/delete-button";
import { PageHeader } from "@/components/layout/page-header";
import { ReceiptThumbs } from "@/components/receipt-thumbs";
import { ExpenseStatusBadge } from "@/components/status-badges";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canApproveExpense, canDeleteExpense, canEditExpense } from "@/lib/expense-rules";
import { can } from "@/lib/permissions";
import { formatAmount, formatDate, formatDateTime, formatPKR } from "@/lib/format";
import { PAYMENT_MODE_LABELS } from "@/lib/validation/expenses";
import { requireUser } from "@/server/auth";
import { pageData, parseId } from "@/server/params";
import { namesForChanges } from "@/server/services/activity-service";
import { getExpenseDetail } from "@/server/services/expense-service";
import { getSettings } from "@/server/services/settings-service";
import { approveExpenseAction, deleteExpenseAction, rejectExpenseAction } from "../actions";
import { ApprovalControls } from "../approval-controls";

export const metadata = { title: "Expense" };

const ACTION_LABEL = { CREATE: "Created", UPDATE: "Edited", DELETE: "Deleted", APPROVE: "Approved", REJECT: "Rejected", LOGIN: "Login" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-border/60 py-2.5 text-sm last:border-0 sm:grid-cols-[10rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export default async function ExpenseDetailPage({ params, searchParams }: PageProps<"/expenses/[id]">) {
  const actor = await requireUser();
  const id = parseId((await params).id);
  const sp = await searchParams;
  const [{ expense: e, splitLines, history }, settings] = await Promise.all([
    pageData(getExpenseDetail(actor, id)),
    getSettings(),
  ]);
  const cur = settings.currencyLabel;
  const names = await namesForChanges(history.map((h) => h.changes));
  const splitTotal = splitLines.reduce((s, l) => s.plus(l.amount), new Prisma.Decimal(0));

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{e.expenseNo}</span> <ExpenseStatusBadge status={e.status} />
            {e.status === "APPROVED" && <Lock className="size-4 text-muted-foreground" aria-label="Locked" />}
          </span>
        }
        description={`${formatPKR(e.amount, cur)} · ${e.project.code} ${e.project.name} · ${formatDate(e.date)}`}
        actions={
          <>
            {canEditExpense(actor, e) && (
              <Link href={`/expenses/${e.id}/edit`} className={buttonVariants({ variant: "outline" })}>
                <Pencil /> {e.status === "REJECTED" ? "Edit & resubmit" : "Edit"}
              </Link>
            )}
            {canDeleteExpense(actor, e) && (
              <DeleteButton
                action={deleteExpenseAction.bind(null, e.id)}
                confirmText={
                  e.splitGroupId
                    ? `Delete the whole split bill (${splitLines.length} lines)?`
                    : "Delete this expense? It will no longer count anywhere."
                }
              />
            )}
          </>
        }
      />

      {sp.saved && (
        <Alert variant="success" className="mb-4">
          <CircleCheck />
          <AlertDescription className="text-inherit">
            {Number(sp.saved) > 1 ? `Split bill saved as ${sp.saved} expense lines.` : "Expense saved."}
            {e.status === "PENDING" && " It is waiting for approval."}
          </AlertDescription>
        </Alert>
      )}
      {sp.updated && (
        <Alert variant="success" className="mb-4">
          <CircleCheck />
          <AlertDescription className="text-inherit">
            Changes saved{e.status === "PENDING" ? " — waiting for approval" : ""}.
          </AlertDescription>
        </Alert>
      )}
      {e.status === "REJECTED" && (
        <Alert variant="destructive" className="mb-4">
          <XCircle />
          <AlertTitle>Rejected</AlertTitle>
          <AlertDescription className="text-inherit">
            {e.rejectionReason}
            {canEditExpense(actor, e) && " — edit it to correct and resubmit."}
          </AlertDescription>
        </Alert>
      )}

      {canApproveExpense(actor, e) && (
        <Card className="mb-4 border-amber-200 bg-amber-50/60">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-sm text-amber-900">
              <Clock className="mt-0.5 size-4 shrink-0" />
              Waiting for approval{e.splitGroupId ? " — the decision applies to the whole split bill" : ""}. Check the receipt below.
            </p>
            <ApprovalControls
              approve={approveExpenseAction.bind(null, e.id)}
              reject={rejectExpenseAction.bind(null, e.id)}
              splitLines={splitLines.length || 1}
              label={e.expenseNo}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardContent>
              <dl>
                <Row label="Date">
                  <span className="font-mono tabular-nums">{formatDate(e.date)}</span>
                </Row>
                <Row label="Amount">
                  <span className="font-mono font-semibold tabular-nums">{formatPKR(e.amount, cur)}</span>
                </Row>
                {e.gstAmount && (
                  <Row label="GST / sales tax">
                    <span className="font-mono tabular-nums">{formatPKR(e.gstAmount, cur)}</span>
                    <span className="text-muted-foreground"> · included in the amount</span>
                  </Row>
                )}
                {e.whtAmount && (
                  <>
                    <Row label="Withholding tax">
                      <span className="font-mono tabular-nums">{formatPKR(e.whtAmount, cur)}</span>
                      <span className="text-muted-foreground"> · deducted from the payment</span>
                    </Row>
                    <Row label="Net paid">
                      <span className="font-mono font-semibold tabular-nums">{formatPKR(e.amount.minus(e.whtAmount), cur)}</span>
                    </Row>
                  </>
                )}
                <Row label="Project">
                  <Link href={`/projects/${e.project.id}`} className="text-primary hover:underline">
                    {e.project.code} — {e.project.name}
                  </Link>
                </Row>
                <Row label="Head / Sub-head">
                  {e.head.name} / {e.subhead.name}
                </Row>
                <Row label="Payment mode">
                  {PAYMENT_MODE_LABELS[e.paymentMode]}
                  {e.chequeNo && (
                    <>
                      {" · Cheque "}
                      <span className="font-mono">#{e.chequeNo}</span>
                    </>
                  )}
                </Row>
                <Row label="Paid to">
                  {e.paidTo}
                  {e.vendor && (
                    <>
                      {" · "}
                      <Link href={`/vendors/${e.vendor.id}`} className="text-primary hover:underline">
                        vendor profile
                      </Link>
                    </>
                  )}
                  {e.worker && (
                    <>
                      {" · "}
                      <Link href={`/workers/${e.worker.id}`} className="text-primary hover:underline">
                        worker profile
                      </Link>
                    </>
                  )}
                </Row>
                <Row label="Paid from">
                  {e.paidFrom ? (
                    <>
                      {e.paidFrom.name}&rsquo;s cash in hand
                      {(can.manageCash(actor.role) || e.paidFrom.userId === actor.id) && (
                        <>
                          {" · "}
                          <Link href={`/cash/${e.paidFrom.id}`} className="text-primary hover:underline">
                            cash statement
                          </Link>
                        </>
                      )}
                    </>
                  ) : (
                    "Company (paid directly)"
                  )}
                </Row>
                {e.referenceNo && (
                  <Row label="Reference / bill">
                    <span className="font-mono">{e.referenceNo}</span>
                  </Row>
                )}
                <Row label="Description">
                  <span className="whitespace-pre-line">{e.description}</span>
                </Row>
                <Row label="Entered by">
                  {e.createdBy.name} · <span className="font-mono text-xs tabular-nums">{formatDateTime(e.createdAt)}</span>
                </Row>
                {e.approvedBy && (
                  <Row label="Approved by">
                    {e.approvedBy.name} ·{" "}
                    <span className="font-mono text-xs tabular-nums">{formatDateTime(e.approvedAt)}</span>
                  </Row>
                )}
              </dl>
            </CardContent>
          </Card>

          {splitLines.length > 0 && (
            <div>
              <h2 className="mb-2 flex items-center gap-2 font-semibold">
                <Split className="size-4" /> Split bill — {splitLines.length} lines
              </h2>
              <div className="overflow-hidden rounded-lg border border-border/60 bg-card shadow-xs">
                <Table>
                  <TableHeader className="bg-muted/60">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">No.</TableHead>
                      <TableHead className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Project</TableHead>
                      <TableHead className="hidden px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:table-cell">
                        Head / Sub-head
                      </TableHead>
                      <TableHead className="px-3 text-right text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Amount ({cur})
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {splitLines.map((l) => (
                      <TableRow key={l.id} className={l.id === e.id ? "bg-blue-50/60" : undefined}>
                        <TableCell className="px-3">
                          <Link href={`/expenses/${l.id}`} className="font-mono text-xs text-primary hover:underline">
                            {l.expenseNo}
                          </Link>
                        </TableCell>
                        <TableCell className="px-3 whitespace-normal">
                          <span className="font-mono text-xs text-muted-foreground">{l.project.code}</span> {l.project.name}
                        </TableCell>
                        <TableCell className="hidden px-3 sm:table-cell">
                          {l.head.name} / {l.subhead.name}
                        </TableCell>
                        <TableCell className="num px-3 font-mono text-[13px]">{formatAmount(l.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter className="border-t-2 bg-muted/60 font-semibold">
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={2} className="px-3">
                        Bill total
                      </TableCell>
                      <TableCell className="hidden sm:table-cell" />
                      <TableCell className="num px-3 font-mono text-[13px]">{formatAmount(splitTotal)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Receipts</CardTitle>
            </CardHeader>
            <CardContent>
              <ReceiptThumbs attachments={e.attachments} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l border-border/80 pl-4">
                {history.map((h) => (
                  <li key={h.id} className="relative text-sm">
                    <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card bg-primary/70" />
                    <div>
                      <span className="font-medium">{ACTION_LABEL[h.action]}</span> by {h.user.name}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground tabular-nums">{formatDateTime(h.createdAt)}</div>
                    {h.action !== "CREATE" && (
                      <div className="mt-1">
                        <ActivityChanges changes={h.changes} compact names={names} />
                      </div>
                    )}
                  </li>
                ))}
                {history.length === 0 && <li className="text-sm text-muted-foreground">No history recorded.</li>}
              </ol>
              {actor.role === "ADMIN" && (
                <>
                <Separator className="mt-4" />
                <Link
                  href={`/settings/activity-log?entityType=expense&entityId=${e.id}`}
                  className="mt-3 inline-block text-xs text-primary hover:underline"
                >
                  Full activity log →
                </Link>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
