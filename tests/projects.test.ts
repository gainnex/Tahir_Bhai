import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { budgetLevel } from "@/lib/budget";
import { db } from "@/lib/db";
import { HEAD_OFFICE_CODE } from "@/lib/defaults";
import { ForbiddenError } from "@/lib/errors";
import { projectSchema, type ProjectInput } from "@/lib/validation/projects";
import * as projects from "@/server/services/project-service";
import { budgetUsage } from "@/server/services/totals";
import { admin, makeUser } from "./helpers";

let seq = 0;
function input(extra: Partial<ProjectInput> = {}): ProjectInput {
  seq += 1;
  return {
    code: `T-${Date.now()}-${seq}`,
    name: `Test project ${seq}`,
    clientName: null, projectManager: null,
    location: null,
    startDate: "2026-01-01",
    endDate: null,
    status: "ACTIVE",
    budget: "1000000",
    notes: null,
    siteInchargeIds: [],
    ...extra,
  };
}

async function addExpense(projectId: number, amount: string, status: "APPROVED" | "PENDING" | "REJECTED", deleted = false) {
  const head = await db.expenseHead.findFirstOrThrow({ include: { subheads: true } });
  const a = await admin();
  return db.expense.create({
    data: {
      expenseNo: `TST-${Date.now()}-${Math.random()}`,
      date: new Date("2026-02-01"),
      projectId,
      headId: head.id,
      subheadId: head.subheads[0].id,
      amount: new Prisma.Decimal(amount),
      paymentMode: "CASH",
      paidTo: "x",
      description: "x",
      status,
      createdById: a.id,
      deletedAt: deleted ? new Date() : null,
    },
  });
}

describe("project validation", () => {
  // Raw form values, as the browser sends them
  const form = (extra: Record<string, unknown> = {}) => ({
    code: "PRJ-1", name: "X", clientName: "", location: "", startDate: "2026-01-01", endDate: "",
    status: "ACTIVE", budget: "", notes: "", ...extra,
  });
  it("uppercases codes, rejects end before start and bad budgets", () => {
    const ok = projectSchema.parse(form({ code: "prj-9", budget: "1,250,000.50", siteInchargeIds: ["3", "4"] }));
    expect(ok.code).toBe("PRJ-9");
    expect(ok.budget).toBe("1250000.50");
    expect(ok.siteInchargeIds).toEqual([3, 4]);
    expect(ok.clientName).toBeNull();
    expect(projectSchema.safeParse(form({ startDate: "2026-05-01", endDate: "2026-04-01" })).success).toBe(false);
    expect(projectSchema.safeParse(form({ budget: "12.345" })).success).toBe(false);
    expect(projectSchema.safeParse(form({ budget: "abc" })).success).toBe(false);
  });
});

describe("budget levels", () => {
  it("green < 80, amber 80–100, red > 100", () => {
    expect(budgetLevel(79.9)).toBe("ok");
    expect(budgetLevel(80)).toBe("warning");
    expect(budgetLevel(100)).toBe("warning");
    expect(budgetLevel(100.1)).toBe("over");
    const u = budgetUsage(new Prisma.Decimal("1000"), new Prisma.Decimal("1250.50"))!;
    expect(u.remaining).toBe("-250.50");
    expect(u.level).toBe("over");
    expect(budgetUsage(null)).toBeNull();
  });
});

describe("projects", () => {
  it("only admin can create; codes are unique; changes are logged", async () => {
    const acc = await makeUser("ACCOUNTANT");
    await expect(projects.createProject(acc, input())).rejects.toBeInstanceOf(ForbiddenError);

    const a = await admin();
    const i = input();
    const p = (await projects.createProject(a, i))!;
    await expect(projects.createProject(a, { ...input(), code: i.code })).rejects.toThrow("already used");
    const log = await db.activityLog.findFirst({ where: { entityType: "project", entityId: p.id, action: "CREATE" } });
    expect(log).not.toBeNull();
  });

  it("site in-charges only see assigned projects", async () => {
    const a = await admin();
    const site = await makeUser("SITE_INCHARGE");
    const mine = (await projects.createProject(a, input({ siteInchargeIds: [site.id] })))!;
    const other = (await projects.createProject(a, input()))!;

    const visible = await projects.listProjects(site);
    expect(visible.map((p) => p.id)).toEqual([mine.id]);
    await expect(projects.getProjectProfile(site, other.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(projects.getProjectProfile(site, mine.id)).resolves.toBeTruthy();

    // Unassign -> access gone
    await projects.updateProject(a, mine.id, { ...input({ code: mine.code }), siteInchargeIds: [] });
    await expect(projects.getProjectProfile(site, mine.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses to assign non-site-in-charge users", async () => {
    const a = await admin();
    const acc = await makeUser("ACCOUNTANT");
    await expect(projects.createProject(a, input({ siteInchargeIds: [acc.id] }))).rejects.toThrow("Only Site In-charge");
  });

  it("totals count only approved, non-deleted expenses", async () => {
    const a = await admin();
    const p = (await projects.createProject(a, input({ budget: "1000" })))!;
    await addExpense(p.id, "500.25", "APPROVED");
    await addExpense(p.id, "300", "APPROVED");
    await addExpense(p.id, "999", "PENDING");
    await addExpense(p.id, "999", "REJECTED");
    await addExpense(p.id, "999", "APPROVED", true); // soft-deleted

    const profile = await projects.getProjectProfile(a, p.id);
    expect(profile.spent.toFixed(2)).toBe("800.25");
    expect(profile.pendingAmount.toFixed(2)).toBe("999.00");
    expect(profile.usage?.percentUsed).toBe(80);
    expect(profile.usage?.level).toBe("warning");

    const listed = (await projects.listProjects(a)).find((x) => x.id === p.id)!;
    expect(listed.spent.toFixed(2)).toBe("800.25");
  });

  it("protects Head Office and projects with expenses from deletion", async () => {
    const a = await admin();
    const ho = await db.project.findUniqueOrThrow({ where: { code: HEAD_OFFICE_CODE } });
    await expect(projects.deleteProject(a, ho.id)).rejects.toThrow("cannot be deleted");
    await expect(
      projects.updateProject(a, ho.id, { ...input(), code: "HACK", status: "COMPLETED" }),
    ).rejects.toThrow("cannot be marked Completed");

    const withExp = (await projects.createProject(a, input()))!;
    await addExpense(withExp.id, "10", "PENDING");
    await expect(projects.deleteProject(a, withExp.id)).rejects.toThrow("has 1 expense");

    const empty = (await projects.createProject(a, input()))!;
    await projects.deleteProject(a, empty.id);
    expect((await projects.listProjects(a)).some((x) => x.id === empty.id)).toBe(false);
    expect((await db.project.findUnique({ where: { id: empty.id } }))?.deletedAt).not.toBeNull();
  });

  it("search is case-insensitive on every database", async () => {
    const a = await admin();
    const p = (await projects.createProject(a, input({ name: "Bahria Heights Tower", clientName: "Bahria Town" })))!;
    for (const q of ["bahria heights", "BAHRIA HEIGHTS", "bahria town"]) {
      expect((await projects.listProjects(a, { q })).map((x) => x.id)).toContain(p.id);
    }
  });

  it("completed projects are excluded from new-expense options", async () => {
    const a = await admin();
    const done = (await projects.createProject(a, input({ status: "COMPLETED" })))!;
    const opts = await projects.listProjectOptions(a, { forNewExpense: true });
    expect(opts.some((o) => o.id === done.id)).toBe(false);
    expect((await projects.listProjectOptions(a)).some((o) => o.id === done.id)).toBe(true);
  });
});
