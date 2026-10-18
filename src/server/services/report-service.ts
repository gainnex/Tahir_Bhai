import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ADVANCE_SUBHEAD, LABOUR_HEAD } from "@/lib/defaults";
import { formatDate, parseInputDate, plural } from "@/lib/format";
import {
  filtersToQuery,
  PERIOD_LABELS,
  REPORTS,
  type Report,
  type ReportFilters,
  type ReportRow,
  type ReportSlug,
} from "@/lib/reports";
import { PAYMENT_MODE_LABELS, type ExpenseFilters } from "@/lib/validation/expenses";
import { TRADE_LABELS, VENDOR_TYPE_LABELS } from "@/lib/validation/parties";
import type { Actor } from "@/server/guards";
import { expenseScope, listExpenses } from "./expense-service";
import { assertProjectAccess } from "./project-service";

// The reports (docs/FEATURES.md §9, plus the tax report from changes/changes.pdf). Business rule 6: only APPROVED expenses count,
// unless the "include pending" toggle is on. Deleted rows never count (rule 8).

const ZERO = new Prisma.Decimal(0);
const money = (d: Prisma.Decimal | null | undefined) => (d ?? ZERO).toFixed(2);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const pct = (part: Prisma.Decimal, whole: Prisma.Decimal) =>
  whole.isZero() ? null : part.div(whole).mul(100).toDecimalPlaces(1).toNumber();

/** Base filter for every report: visibility + status + date range (+ project). */
function baseWhere(actor: Actor, f: ReportFilters, opts: { ignoreDates?: boolean } = {}): Prisma.ExpenseWhereInput {
  return {
    AND: [
      expenseScope(actor),
      { status: { in: f.includePending ? ["APPROVED", "PENDING"] : ["APPROVED"] } },
      !opts.ignoreDates && f.from ? { date: { gte: parseInputDate(f.from) } } : {},
      !opts.ignoreDates && f.to ? { date: { lte: parseInputDate(f.to) } } : {},
      f.projectId ? { projectId: f.projectId } : {},
    ],
  };
}

async function describeFilters(f: ReportFilters, extra: string[] = []) {
  const parts: string[] = [];
  if (f.period === "custom") {
    parts.push(f.from && f.to ? `${formatDate(f.from)} to ${formatDate(f.to)}` : f.from ? `From ${formatDate(f.from)}` : `Up to ${formatDate(f.to)}`);
  } else {
    parts.push(
      f.from ? `${PERIOD_LABELS[f.period]} (${formatDate(f.from)} to ${formatDate(f.to)})` : PERIOD_LABELS[f.period],
    );
  }
  if (f.projectId) {
    const p = await db.project.findUnique({ where: { id: f.projectId }, select: { code: true, name: true } });
    if (p) parts.push(`Project: ${p.code} ${p.name}`);
  }
  parts.push(...extra);
  parts.push(f.includePending ? "Approved + pending expenses" : "Approved expenses only");
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// 1. Project cost summary
// ---------------------------------------------------------------------------

async function projectCostSummary(actor: Actor, f: ReportFilters): Promise<Report> {
  const projects = await db.project.findMany({
    where: {
      deletedAt: null,
      ...(f.projectId ? { id: f.projectId } : {}),
      ...(actor.role === "SITE_INCHARGE" ? { users: { some: { userId: actor.id } } } : {}),
    },
    orderBy: [{ isHeadOffice: "desc" }, { code: "asc" }],
  });
  const ids = projects.map((p) => p.id);
  const [byProjectHead, toDate, heads] = await Promise.all([
    db.expense.groupBy({ by: ["projectId", "headId"], where: { AND: [baseWhere(actor, f), { projectId: { in: ids } }] }, _sum: { amount: true } }),
    db.expense.groupBy({
      by: ["projectId"],
      where: { AND: [baseWhere(actor, f, { ignoreDates: true }), { projectId: { in: ids } }] },
      _sum: { amount: true },
    }),
    db.expenseHead.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  // Only heads that have spend in the period become columns (keeps the sheet readable)
  const usedHeads = heads.filter((h) => byProjectHead.some((r) => r.headId === h.id));
  const cell = new Map(byProjectHead.map((r) => [`${r.projectId}:${r.headId}`, r._sum.amount ?? ZERO]));
  const toDateMap = new Map(toDate.map((r) => [r.projectId, r._sum.amount ?? ZERO]));

  const headTotals = new Map<number, Prisma.Decimal>();
  let grand = ZERO;
  let budgetTotal = ZERO;
  let toDateTotal = ZERO;
  const rows: ReportRow[] = projects.map((p) => {
    const cells: ReportRow["cells"] = { code: p.code, project: p.name };
    let total = ZERO;
    for (const h of usedHeads) {
      const v = cell.get(`${p.id}:${h.id}`) ?? ZERO;
      cells[`h${h.id}`] = money(v);
      total = total.plus(v);
      headTotals.set(h.id, (headTotals.get(h.id) ?? ZERO).plus(v));
    }
    const spent = toDateMap.get(p.id) ?? ZERO;
    grand = grand.plus(total);
    toDateTotal = toDateTotal.plus(spent);
    if (p.budget) budgetTotal = budgetTotal.plus(p.budget);
    cells.total = money(total);
    cells.budget = p.budget ? money(p.budget) : null;
    cells.toDate = money(spent);
    cells.remaining = p.budget ? money(p.budget.minus(spent)) : null;
    cells.used = p.budget && !p.budget.isZero() ? pct(spent, p.budget) : null;
    return { cells, links: { project: `/projects/${p.id}` } };
  });

  const totals: ReportRow["cells"] = { code: "Total", project: plural(projects.length, "project") };
  for (const h of usedHeads) totals[`h${h.id}`] = money(headTotals.get(h.id));
  Object.assign(totals, { total: money(grand), budget: money(budgetTotal), toDate: money(toDateTotal), remaining: null, used: null });

  return {
    slug: "project-cost-summary",
    title: REPORTS["project-cost-summary"].title,
    subtitle: await describeFilters(f),
    landscape: true,
    tables: [
      {
        columns: [
          { key: "code", label: "Code", type: "text" },
          { key: "project", label: "Project", type: "text", wide: true },
          ...usedHeads.map((h) => ({ key: `h${h.id}`, label: h.name, type: "money" as const })),
          { key: "total", label: "Total (period)", type: "money" },
          { key: "budget", label: "Budget", type: "money" },
          { key: "toDate", label: "Spent to date", type: "money" },
          { key: "remaining", label: "Remaining", type: "money" },
          { key: "used", label: "Used", type: "percent" },
        ],
        rows,
        totals,
        empty: "No projects.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 2. Expense head report
// ---------------------------------------------------------------------------

async function expenseHeadReport(actor: Actor, f: ReportFilters): Promise<Report> {
  const head = f.headId ? await db.expenseHead.findUnique({ where: { id: f.headId } }) : null;
  const where: Prisma.ExpenseWhereInput = { AND: [baseWhere(actor, f), head ? { headId: head.id } : {}] };
  const [bySub, byProject, total] = await Promise.all([
    db.expense.groupBy({ by: ["headId", "subheadId"], where, _sum: { amount: true }, _count: true }),
    db.expense.groupBy({ by: ["projectId"], where, _sum: { amount: true }, _count: true }),
    db.expense.aggregate({ where, _sum: { amount: true }, _count: true }),
  ]);
  const grand = total._sum.amount ?? ZERO;
  const [heads, subs, projects] = await Promise.all([
    db.expenseHead.findMany({ select: { id: true, name: true, sortOrder: true } }),
    db.expenseSubhead.findMany({ where: { id: { in: bySub.map((r) => r.subheadId) } }, select: { id: true, name: true } }),
    db.project.findMany({ where: { id: { in: byProject.map((r) => r.projectId) } }, select: { id: true, code: true, name: true } }),
  ]);
  const headById = new Map(heads.map((h) => [h.id, h]));
  const subName = new Map(subs.map((s) => [s.id, s.name]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const subRows: ReportRow[] = bySub
    .sort(
      (a, b) =>
        (headById.get(a.headId)?.sortOrder ?? 0) - (headById.get(b.headId)?.sortOrder ?? 0) ||
        (b._sum.amount ?? ZERO).comparedTo(a._sum.amount ?? ZERO),
    )
    .map((r) => ({
      cells: {
        head: headById.get(r.headId)?.name ?? "—",
        subhead: subName.get(r.subheadId) ?? "—",
        entries: r._count,
        amount: money(r._sum.amount),
        share: pct(r._sum.amount ?? ZERO, grand),
      },
    }));
  const projectRows: ReportRow[] = byProject
    .sort((a, b) => (b._sum.amount ?? ZERO).comparedTo(a._sum.amount ?? ZERO))
    .map((r) => {
      const p = projectById.get(r.projectId);
      return {
        cells: { code: p?.code ?? "—", project: p?.name ?? "—", entries: r._count, amount: money(r._sum.amount), share: pct(r._sum.amount ?? ZERO, grand) },
        links: p ? { project: `/projects/${p.id}` } : undefined,
      };
    });
  const totals = { entries: total._count, amount: money(grand), share: grand.isZero() ? null : 100 };

  return {
    slug: "expense-head",
    title: head ? `Expense Head Report — ${head.name}` : REPORTS["expense-head"].title,
    subtitle: await describeFilters(f, [head ? `Head: ${head.name}` : "All heads"]),
    tables: [
      {
        title: "By sub-head",
        columns: [
          { key: "head", label: "Head", type: "text" },
          { key: "subhead", label: "Sub-head", type: "text", wide: true },
          { key: "entries", label: "Entries", type: "int" },
          { key: "amount", label: "Amount", type: "money" },
          { key: "share", label: "Share", type: "percent" },
        ],
        rows: subRows,
        totals: { head: "Total", ...totals },
        empty: "No expenses in this period.",
      },
      {
        title: "By project",
        columns: [
          { key: "code", label: "Code", type: "text" },
          { key: "project", label: "Project", type: "text", wide: true },
          { key: "entries", label: "Entries", type: "int" },
          { key: "amount", label: "Amount", type: "money" },
          { key: "share", label: "Share", type: "percent" },
        ],
        rows: projectRows,
        totals: { code: "Total", ...totals },
        empty: "No expenses in this period.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 3. Project ledger
// ---------------------------------------------------------------------------

async function projectLedger(actor: Actor, f: ReportFilters): Promise<Report> {
  const base = { slug: "project-ledger" as const, title: REPORTS["project-ledger"].title };
  if (!f.projectId) {
    return { ...base, subtitle: await describeFilters(f), tables: [], message: "Select a project to see its ledger." };
  }
  const project = await assertProjectAccess(actor, f.projectId);

  const [broughtForward, rows] = await Promise.all([
    f.from
      ? db.expense.aggregate({
          where: { AND: [baseWhere(actor, { ...f, from: undefined, to: undefined }), { date: { lt: parseInputDate(f.from) } }] },
          _sum: { amount: true },
          _count: true,
        })
      : Promise.resolve(null),
    db.expense.findMany({
      where: baseWhere(actor, f),
      orderBy: [{ date: "asc" }, { id: "asc" }],
      include: {
        head: { select: { name: true } },
        subhead: { select: { name: true } },
        _count: { select: { attachments: true } },
      },
    }),
  ]);

  let running = broughtForward?._sum.amount ?? ZERO;
  let periodTotal = ZERO;
  const out: ReportRow[] = [];
  if (broughtForward && broughtForward._count > 0) {
    out.push({
      cells: { date: f.from!, no: "", head: "Brought forward", description: `${plural(broughtForward._count, "entry", "entries")} before ${formatDate(f.from)}`, amount: null, running: money(running) },
      emphasis: true,
    });
  }
  for (const e of rows) {
    running = running.plus(e.amount);
    periodTotal = periodTotal.plus(e.amount);
    out.push({
      cells: {
        date: iso(e.date),
        no: e.expenseNo,
        head: e.head.name,
        subhead: e.subhead.name,
        paidTo: e.paidTo,
        description: e.description,
        mode: PAYMENT_MODE_LABELS[e.paymentMode] + (e.chequeNo ? ` #${e.chequeNo}` : ""),
        ...(f.includePending ? { status: e.status === "PENDING" ? "Pending" : "Approved" } : {}),
        amount: money(e.amount),
        running: money(running),
        receipts: e._count.attachments || null,
      },
      links: { no: `/expenses/${e.id}`, receipts: `/expenses/${e.id}` },
    });
  }

  return {
    ...base,
    title: `Project Ledger — ${project.code} ${project.name}`,
    subtitle: await describeFilters(f),
    landscape: true,
    tables: [
      {
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "no", label: "No.", type: "text" },
          { key: "head", label: "Head", type: "text" },
          { key: "subhead", label: "Sub-head", type: "text" },
          { key: "paidTo", label: "Paid to", type: "text" },
          { key: "description", label: "Description", type: "text", wide: true },
          { key: "mode", label: "Mode", type: "text" },
          ...(f.includePending ? [{ key: "status", label: "Status", type: "text" as const }] : []),
          { key: "amount", label: "Amount", type: "money" },
          { key: "running", label: "Running total", type: "money" },
          { key: "receipts", label: "Receipts", type: "int" },
        ],
        rows: out,
        totals: { date: null, no: "Total", amount: money(periodTotal), running: money(running) },
        empty: "No expenses in this period.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 4. Labour payments
// ---------------------------------------------------------------------------

async function labourPayments(actor: Actor, f: ReportFilters): Promise<Report> {
  const where: Prisma.ExpenseWhereInput = {
    AND: [baseWhere(actor, f), { workerId: f.workerId ? f.workerId : { not: null } }],
  };
  const advanceWhere: Prisma.ExpenseWhereInput = {
    AND: [where, { subhead: { name: ADVANCE_SUBHEAD, head: { name: LABOUR_HEAD } } }],
  };
  const [all, adv] = await Promise.all([
    db.expense.groupBy({ by: ["workerId", "projectId"], where, _sum: { amount: true }, _count: true }),
    db.expense.groupBy({ by: ["workerId", "projectId"], where: advanceWhere, _sum: { amount: true } }),
  ]);
  const advMap = new Map(adv.map((r) => [`${r.workerId}:${r.projectId}`, r._sum.amount ?? ZERO]));
  const [workers, projects] = await Promise.all([
    db.worker.findMany({ where: { id: { in: all.map((r) => r.workerId!) } }, select: { id: true, name: true, trade: true } }),
    db.project.findMany({ where: { id: { in: all.map((r) => r.projectId) } }, select: { id: true, code: true, name: true } }),
  ]);
  const workerById = new Map(workers.map((w) => [w.id, w]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  type Agg = { entries: number; total: Prisma.Decimal; advances: Prisma.Decimal };
  const perWorker = new Map<number, Agg>();
  const detail: (Agg & { workerId: number; projectId: number })[] = [];
  for (const r of all) {
    const total = r._sum.amount ?? ZERO;
    const advances = advMap.get(`${r.workerId}:${r.projectId}`) ?? ZERO;
    const w = perWorker.get(r.workerId!) ?? { entries: 0, total: ZERO, advances: ZERO };
    perWorker.set(r.workerId!, { entries: w.entries + r._count, total: w.total.plus(total), advances: w.advances.plus(advances) });
    detail.push({ workerId: r.workerId!, projectId: r.projectId, entries: r._count, total, advances });
  }
  const sum = (xs: Agg[]) =>
    xs.reduce((s, x) => ({ entries: s.entries + x.entries, total: s.total.plus(x.total), advances: s.advances.plus(x.advances) }), {
      entries: 0,
      total: ZERO,
      advances: ZERO,
    });
  const grand = sum([...perWorker.values()]);
  const name = (id: number) => workerById.get(id)?.name ?? "—";

  const workerRows: ReportRow[] = [...perWorker.entries()]
    .sort((a, b) => name(a[0]).localeCompare(name(b[0])))
    .map(([id, a]) => ({
      cells: {
        worker: name(id),
        trade: workerById.get(id) ? TRADE_LABELS[workerById.get(id)!.trade] : "",
        entries: a.entries,
        wages: money(a.total.minus(a.advances)),
        advances: money(a.advances),
        total: money(a.total),
      },
      links: { worker: `/workers/${id}` },
    }));
  const detailRows: ReportRow[] = detail
    .sort((a, b) => name(a.workerId).localeCompare(name(b.workerId)) || (projectById.get(a.projectId)?.code ?? "").localeCompare(projectById.get(b.projectId)?.code ?? ""))
    .map((d) => {
      const p = projectById.get(d.projectId);
      return {
        cells: {
          worker: name(d.workerId),
          project: p ? `${p.code} ${p.name}` : "—",
          entries: d.entries,
          wages: money(d.total.minus(d.advances)),
          advances: money(d.advances),
          total: money(d.total),
        },
        links: { worker: `/workers/${d.workerId}` },
      };
    });
  const totals = { entries: grand.entries, wages: money(grand.total.minus(grand.advances)), advances: money(grand.advances), total: money(grand.total) };
  const worker = f.workerId ? workerById.get(f.workerId) ?? (await db.worker.findUnique({ where: { id: f.workerId } })) : null;

  return {
    slug: "labour-payments",
    title: REPORTS["labour-payments"].title,
    subtitle: await describeFilters(f, [worker ? `Worker: ${worker.name}` : "All workers"]),
    tables: [
      {
        title: "Per worker",
        columns: [
          { key: "worker", label: "Worker", type: "text", wide: true },
          { key: "trade", label: "Trade", type: "text" },
          { key: "entries", label: "Payments", type: "int" },
          { key: "wages", label: "Wages & other", type: "money" },
          { key: "advances", label: "Advances", type: "money" },
          { key: "total", label: "Total paid", type: "money" },
        ],
        rows: workerRows,
        totals: { worker: "Total", ...totals },
        empty: "No labour payments in this period.",
      },
      {
        title: "Per worker and project",
        columns: [
          { key: "worker", label: "Worker", type: "text" },
          { key: "project", label: "Project", type: "text", wide: true },
          { key: "entries", label: "Payments", type: "int" },
          { key: "wages", label: "Wages & other", type: "money" },
          { key: "advances", label: "Advances", type: "money" },
          { key: "total", label: "Total paid", type: "money" },
        ],
        rows: detailRows,
        totals: { worker: "Total", ...totals },
        empty: "No labour payments in this period.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 5. Vendor report (with drill-down)
// ---------------------------------------------------------------------------

async function vendorReport(actor: Actor, f: ReportFilters): Promise<Report> {
  const where: Prisma.ExpenseWhereInput = {
    AND: [baseWhere(actor, f), { vendorId: f.vendorId ? f.vendorId : { not: null } }],
  };
  const grouped = await db.expense.groupBy({
    by: ["vendorId"],
    where,
    _sum: { amount: true, gstAmount: true, whtAmount: true },
    _count: true,
  });
  const vendors = await db.vendor.findMany({
    where: { id: { in: grouped.map((g) => g.vendorId!) } },
    select: { id: true, name: true, type: true },
  });
  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  const grand = grouped.reduce((s, g) => s.plus(g._sum.amount ?? ZERO), ZERO);
  const grandGst = grouped.reduce((s, g) => s.plus(g._sum.gstAmount ?? ZERO), ZERO);
  const grandWht = grouped.reduce((s, g) => s.plus(g._sum.whtAmount ?? ZERO), ZERO);
  const count = grouped.reduce((s, g) => s + g._count, 0);

  const summary: ReportRow[] = grouped
    .sort((a, b) => (b._sum.amount ?? ZERO).comparedTo(a._sum.amount ?? ZERO))
    .map((g) => {
      const v = vendorById.get(g.vendorId!);
      return {
        cells: {
          vendor: v?.name ?? "—",
          type: v ? VENDOR_TYPE_LABELS[v.type] : "",
          entries: g._count,
          total: money(g._sum.amount),
          gst: money(g._sum.gstAmount),
          wht: money(g._sum.whtAmount),
          net: money((g._sum.amount ?? ZERO).minus(g._sum.whtAmount ?? ZERO)),
          share: pct(g._sum.amount ?? ZERO, grand),
        },
        links: { vendor: `/reports/vendors?${filtersToQuery(f, { vendorId: g.vendorId! })}` },
      };
    });

  const tables: Report["tables"] = [
    {
      title: f.vendorId ? "Summary" : "Total paid per vendor",
      columns: [
        { key: "vendor", label: "Vendor", type: "text", wide: true },
        { key: "type", label: "Type", type: "text" },
        { key: "entries", label: "Entries", type: "int" },
        { key: "total", label: "Total billed", type: "money" },
        { key: "gst", label: "GST", type: "money" },
        { key: "wht", label: "WHT", type: "money" },
        { key: "net", label: "Net paid", type: "money" },
        { key: "share", label: "Share", type: "percent" },
      ],
      rows: summary,
      totals: {
        vendor: "Total",
        entries: count,
        total: money(grand),
        gst: money(grandGst),
        wht: money(grandWht),
        net: money(grand.minus(grandWht)),
        share: grand.isZero() ? null : 100,
      },
      empty: "No vendor payments in this period.",
    },
  ];

  let vendorName: string | null = null;
  if (f.vendorId) {
    const vendor = await db.vendor.findUnique({ where: { id: f.vendorId } });
    vendorName = vendor?.name ?? null;
    const entries = await db.expense.findMany({
      where,
      orderBy: [{ date: "asc" }, { id: "asc" }],
      include: { project: { select: { code: true } }, head: { select: { name: true } }, subhead: { select: { name: true } } },
    });
    tables.push({
      title: `Entries — ${vendorName ?? "vendor"}`,
      columns: [
        { key: "date", label: "Date", type: "date" },
        { key: "no", label: "No.", type: "text" },
        { key: "project", label: "Project", type: "text" },
        { key: "head", label: "Head / Sub-head", type: "text" },
        { key: "description", label: "Description", type: "text", wide: true },
        { key: "amount", label: "Amount", type: "money" },
        { key: "gst", label: "GST", type: "money" },
        { key: "wht", label: "WHT", type: "money" },
      ],
      rows: entries.map((e) => ({
        cells: {
          date: iso(e.date),
          no: e.expenseNo,
          project: e.project.code,
          head: `${e.head.name} / ${e.subhead.name}`,
          description: e.description,
          amount: money(e.amount),
          gst: e.gstAmount ? money(e.gstAmount) : null,
          wht: e.whtAmount ? money(e.whtAmount) : null,
        },
        links: { no: `/expenses/${e.id}` },
      })),
      totals: {
        date: null,
        no: "Total",
        amount: money(entries.reduce((s, e) => s.plus(e.amount), ZERO)),
        gst: money(entries.reduce((s, e) => s.plus(e.gstAmount ?? ZERO), ZERO)),
        wht: money(entries.reduce((s, e) => s.plus(e.whtAmount ?? ZERO), ZERO)),
      },
      empty: "No entries for this vendor in this period.",
    });
  }

  return {
    slug: "vendors",
    title: REPORTS.vendors.title,
    subtitle: await describeFilters(f, [vendorName ? `Vendor: ${vendorName}` : "All vendors"]),
    tables,
  };
}

// ---------------------------------------------------------------------------
// 6. Tax report (GST and withholding tax)
// ---------------------------------------------------------------------------

async function taxReport(actor: Actor, f: ReportFilters): Promise<Report> {
  const where: Prisma.ExpenseWhereInput = {
    AND: [
      baseWhere(actor, f),
      f.vendorId ? { vendorId: f.vendorId } : {},
      { OR: [{ gstAmount: { gt: 0 } }, { whtAmount: { gt: 0 } }] },
    ],
  };
  const entries = await db.expense.findMany({
    where,
    orderBy: [{ date: "asc" }, { id: "asc" }],
    include: { project: { select: { code: true } }, vendor: { select: { name: true, ntn: true } } },
  });

  // Per payee: a vendor when one is linked, otherwise the "paid to" name
  type Payee = { name: string; ntn: string; entries: number; amount: Prisma.Decimal; gst: Prisma.Decimal; wht: Prisma.Decimal };
  const payees = new Map<string, Payee>();
  for (const e of entries) {
    const key = e.vendorId ? `v${e.vendorId}` : `p${e.paidTo.trim().toLowerCase()}`;
    const p = payees.get(key) ?? { name: e.vendor?.name ?? e.paidTo, ntn: e.vendor?.ntn ?? "", entries: 0, amount: ZERO, gst: ZERO, wht: ZERO };
    p.entries += 1;
    p.amount = p.amount.plus(e.amount);
    p.gst = p.gst.plus(e.gstAmount ?? ZERO);
    p.wht = p.wht.plus(e.whtAmount ?? ZERO);
    payees.set(key, p);
  }
  const total = entries.reduce((s, e) => s.plus(e.amount), ZERO);
  const gst = entries.reduce((s, e) => s.plus(e.gstAmount ?? ZERO), ZERO);
  const wht = entries.reduce((s, e) => s.plus(e.whtAmount ?? ZERO), ZERO);

  let vendorName: string | null = null;
  if (f.vendorId) vendorName = (await db.vendor.findUnique({ where: { id: f.vendorId } }))?.name ?? null;

  return {
    slug: "tax",
    title: REPORTS.tax.title,
    subtitle: await describeFilters(f, [vendorName ? `Vendor: ${vendorName}` : "All payees"]),
    landscape: true,
    tables: [
      {
        title: "Tax per payee",
        columns: [
          { key: "payee", label: "Payee", type: "text", wide: true },
          { key: "ntn", label: "NTN", type: "text" },
          { key: "entries", label: "Entries", type: "int" },
          { key: "amount", label: "Billed", type: "money" },
          { key: "gst", label: "GST", type: "money" },
          { key: "wht", label: "WHT", type: "money" },
          { key: "net", label: "Net paid", type: "money" },
        ],
        rows: [...payees.values()]
          .sort((a, b) => b.gst.plus(b.wht).comparedTo(a.gst.plus(a.wht)))
          .map((p) => ({
            cells: {
              payee: p.name,
              ntn: p.ntn,
              entries: p.entries,
              amount: money(p.amount),
              gst: money(p.gst),
              wht: money(p.wht),
              net: money(p.amount.minus(p.wht)),
            },
          })),
        totals: { payee: "Total", entries: entries.length, amount: money(total), gst: money(gst), wht: money(wht), net: money(total.minus(wht)) },
        empty: "No GST or withholding tax recorded in this period.",
      },
      {
        title: "Taxed entries",
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "no", label: "No.", type: "text" },
          { key: "project", label: "Project", type: "text" },
          { key: "payee", label: "Paid to", type: "text", wide: true },
          { key: "ref", label: "Bill no.", type: "text" },
          { key: "amount", label: "Amount", type: "money" },
          { key: "gst", label: "GST", type: "money" },
          { key: "wht", label: "WHT", type: "money" },
          { key: "net", label: "Net paid", type: "money" },
        ],
        rows: entries.map((e) => ({
          cells: {
            date: iso(e.date),
            no: e.expenseNo,
            project: e.project.code,
            payee: e.paidTo,
            ref: e.referenceNo ?? "",
            amount: money(e.amount),
            gst: e.gstAmount ? money(e.gstAmount) : null,
            wht: e.whtAmount ? money(e.whtAmount) : null,
            net: money(e.amount.minus(e.whtAmount ?? ZERO)),
          },
          links: { no: `/expenses/${e.id}` },
        })),
        totals: { date: null, no: "Total", amount: money(total), gst: money(gst), wht: money(wht), net: money(total.minus(wht)) },
        empty: "No taxed entries in this period.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Expense list export (uses the same filters as the /expenses page)
// ---------------------------------------------------------------------------

export const EXPORT_ROW_LIMIT = 20_000;

export async function expenseListReport(actor: Actor, filters: ExpenseFilters): Promise<Report> {
  const result = await listExpenses(actor, { ...filters, page: 1 }, EXPORT_ROW_LIMIT);
  const full = await db.expense.findMany({
    where: { id: { in: result.rows.map((r) => r.id) } },
    select: { id: true, paymentMode: true, chequeNo: true, description: true, referenceNo: true, gstAmount: true, whtAmount: true },
  });
  const extra = new Map(full.map((e) => [e.id, e]));
  const parts = [
    filters.from || filters.to ? `${filters.from ? formatDate(filters.from) : "…"} to ${filters.to ? formatDate(filters.to) : "…"}` : "All dates",
    filters.status ? `Status: ${filters.status.toLowerCase()}` : "All statuses",
    `${plural(result.count, "expense")}`,
  ];
  return {
    slug: "expenses",
    title: "Expenses",
    subtitle: parts.join(" · ") + (result.count > EXPORT_ROW_LIMIT ? ` (first ${EXPORT_ROW_LIMIT} exported)` : ""),
    landscape: true,
    tables: [
      {
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "no", label: "No.", type: "text" },
          { key: "project", label: "Project", type: "text" },
          { key: "head", label: "Head", type: "text" },
          { key: "subhead", label: "Sub-head", type: "text" },
          { key: "paidTo", label: "Paid to", type: "text" },
          { key: "description", label: "Description", type: "text", wide: true },
          { key: "mode", label: "Mode", type: "text" },
          { key: "ref", label: "Ref / cheque", type: "text" },
          { key: "status", label: "Status", type: "text" },
          { key: "enteredBy", label: "Entered by", type: "text" },
          { key: "amount", label: "Amount", type: "money" },
          { key: "gst", label: "GST", type: "money" },
          { key: "wht", label: "WHT", type: "money" },
        ],
        rows: result.rows.map((e) => {
          const x = extra.get(e.id);
          return {
            cells: {
              date: iso(e.date),
              no: e.expenseNo,
              project: e.project.code,
              head: e.head.name,
              subhead: e.subhead.name,
              paidTo: e.paidTo,
              description: x?.description ?? "",
              mode: x ? PAYMENT_MODE_LABELS[x.paymentMode] : "",
              ref: [x?.referenceNo, x?.chequeNo && `Chq ${x.chequeNo}`].filter(Boolean).join(" · "),
              status: e.status.charAt(0) + e.status.slice(1).toLowerCase(),
              enteredBy: e.createdBy.name,
              amount: money(e.amount),
              gst: x?.gstAmount ? money(x.gstAmount) : null,
              wht: x?.whtAmount ? money(x.whtAmount) : null,
            },
            links: { no: `/expenses/${e.id}` },
          };
        }),
        totals: { date: null, no: "Total", amount: money(result.total) },
      },
    ],
  };
}

// ---------------------------------------------------------------------------

export async function buildReport(actor: Actor, slug: Exclude<ReportSlug, "expenses">, f: ReportFilters): Promise<Report> {
  switch (slug) {
    case "project-cost-summary":
      return projectCostSummary(actor, f);
    case "expense-head":
      return expenseHeadReport(actor, f);
    case "project-ledger":
      return projectLedger(actor, f);
    case "labour-payments":
      return labourPayments(actor, f);
    case "vendors":
      return vendorReport(actor, f);
    case "tax":
      return taxReport(actor, f);
  }
}
