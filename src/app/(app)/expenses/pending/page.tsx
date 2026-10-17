import Link from "next/link";
import { Prisma } from "@prisma/client";
import { Split } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ReceiptThumbs } from "@/components/receipt-thumbs";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatAmount, formatDate, formatPKR, plural } from "@/lib/format";
import { requireRole } from "@/server/auth";
import { listPendingApprovals } from "@/server/services/expense-service";
import { getSettings } from "@/server/services/settings-service";
import { approveExpenseAction, rejectExpenseAction } from "../actions";
import { ApprovalControls } from "../approval-controls";

export const metadata = { title: "Pending approvals" };

export default async function PendingApprovalsPage() {
  const actor = await requireRole("ADMIN", "ACCOUNTANT");
  const [rows, settings] = await Promise.all([listPendingApprovals(actor), getSettings()]);
  const cur = settings.currencyLabel;

  // One entry per bill: split lines are grouped, since the decision covers the whole bill.
  type Row = (typeof rows)[number];
  const groups: Row[][] = [];
  const bySplit = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.splitGroupId) groups.push([r]);
    else if (bySplit.has(r.splitGroupId)) bySplit.get(r.splitGroupId)!.push(r);
    else {
      const g = [r];
      bySplit.set(r.splitGroupId, g);
      groups.push(g);
    }
  }
  const total = rows.reduce((s, r) => s.plus(r.amount), new Prisma.Decimal(0));

  return (
    <>
      <PageHeader
        title="Pending approvals"
        description={
          rows.length
            ? `${plural(groups.length, "entry", "entries")} · ${formatPKR(total, cur)} waiting · oldest first`
            : undefined
        }
      />
      {groups.length === 0 && <Notice variant="success">Nothing is waiting for approval.</Notice>}

      <div className="space-y-3">
        {groups.map((g) => {
          const first = g[0];
          const billTotal = g.reduce((s, r) => s.plus(r.amount), new Prisma.Decimal(0));
          return (
            <Card key={first.id}>
              <CardContent className="grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-center">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link href={`/expenses/${first.id}`} className="font-mono text-sm text-primary hover:underline">
                      {first.expenseNo}
                    </Link>
                    <span className="font-mono text-sm text-muted-foreground tabular-nums">{formatDate(first.date)}</span>
                    <span className="font-mono text-lg font-semibold tabular-nums">{formatPKR(billTotal, cur)}</span>
                    {g.length > 1 && (
                      <Badge variant="info">
                        <Split /> Split · {g.length} lines
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">{first.paidTo}</span> — {first.description}
                  </div>
                  {g.map((r) => (
                    <div key={r.id} className="text-xs text-muted-foreground">
                      {r.project.code} {r.project.name} · {r.head.name} / {r.subhead.name}
                      {g.length > 1 && <span className="font-mono tabular-nums"> · {formatAmount(r.amount)}</span>}
                    </div>
                  ))}
                  <div className="text-xs text-muted-foreground">Entered by {first.createdBy.name}</div>
                </div>
                <ReceiptThumbs attachments={first.attachments} size="sm" />
                <div className="lg:w-80">
                  <ApprovalControls
                    compact
                    approve={approveExpenseAction.bind(null, first.id)}
                    reject={rejectExpenseAction.bind(null, first.id)}
                    splitLines={g.length}
                    label={first.expenseNo}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
