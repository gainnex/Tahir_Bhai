import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { diffChanges } from "@/server/services/activity-log";
import { entityHref, listActivity } from "@/server/services/activity-service";
import { createExpenses, updateExpense } from "@/server/services/expense-service";
import { createProject } from "@/server/services/project-service";
import { admin, makeUser } from "./helpers";

describe("activity log", () => {
  it("diffChanges records only changed fields with old -> new, decimals and dates as strings", async () => {
    const { Prisma } = await import("@prisma/client");
    const d = diffChanges(
      { amount: new Prisma.Decimal("100.50"), date: new Date("2026-01-01T00:00:00Z"), paidTo: "A", updatedAt: new Date() },
      { amount: new Prisma.Decimal("120"), date: new Date("2026-01-01T00:00:00Z"), paidTo: "B", updatedAt: new Date(0) },
    );
    expect(d).toEqual({ amount: { old: "100.5", new: "120" }, paidTo: { old: "A", new: "B" } });
  });

  it("only admins can view it", async () => {
    const acc = await makeUser("ACCOUNTANT");
    await expect(listActivity(acc, {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("filters by user, record and action and resolves ids to names", async () => {
    const a = await admin();
    const acc = await makeUser("ACCOUNTANT");
    const p1 = (await createProject(a, {
      code: `AL-${Date.now()}`, name: "Log A", clientName: null, projectManager: null, location: null, startDate: "2026-01-01",
      endDate: null, status: "ACTIVE", budget: null, notes: null, siteInchargeIds: [],
    }))!;
    const p2 = (await createProject(a, {
      code: `AL2-${Date.now()}`, name: "Log B", clientName: null, projectManager: null, location: null, startDate: "2026-01-01",
      endDate: null, status: "ACTIVE", budget: null, notes: null, siteInchargeIds: [],
    }))!;
    const head = await db.expenseHead.findFirstOrThrow({ where: { name: "Material Purchasing" }, include: { subheads: true } });
    const base = {
      date: "2026-10-01", projectId: p1.id, headId: head.id, subheadId: head.subheads[0].id, amount: "500",
      paymentMode: "CASH" as const, chequeNo: null, paidTo: "X", vendorId: null, workerId: null, referenceNo: null, description: "d",
    };
    const [id] = await createExpenses(acc, { kind: "single", data: base });
    await updateExpense(a, id, { ...base, projectId: p2.id }); // admin edits an (auto-)approved entry

    const forRecord = await listActivity(a, { entityType: "expense", entityId: id });
    expect(forRecord.rows.map((r) => r.action).sort()).toEqual(["CREATE", "UPDATE"]);
    expect(forRecord.rows[0].entityLabel).toMatch(/^EXP-/);
    expect(forRecord.names.projectId[p1.id]).toContain("Log A");
    expect(forRecord.names.projectId[p2.id]).toContain("Log B");

    const byUser = await listActivity(a, { userId: acc.id });
    expect(byUser.rows.every((r) => r.userId === acc.id)).toBe(true);
    const updates = await listActivity(a, { action: "UPDATE", entityType: "expense", entityId: id });
    expect(updates.count).toBe(1);

    expect(entityHref("expense", id)).toBe(`/expenses/${id}`);
    expect(entityHref("settings", 0)).toBe("/settings/company");
  });
});
