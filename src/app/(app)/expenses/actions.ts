"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/forms";
import {
  expenseSchema,
  labourPaymentSchema,
  rejectSchema,
  splitExpenseSchema,
  type ExpenseInput,
} from "@/lib/validation/expenses";
import { parseForm, runAction } from "@/server/action-utils";
import { requireUser } from "@/server/auth";
import {
  approveExpense,
  createExpenses,
  deleteExpense,
  rejectExpense,
  updateExpense,
} from "@/server/services/expense-service";
import { filesFrom } from "@/server/storage";

function refresh() {
  // Totals, pending badge and lists all change together.
  revalidatePath("/", "layout");
}

export async function createExpenseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const files = filesFrom(fd, "files");
    let ids: number[];
    if (fd.get("split") === "on") {
      const parsed = parseForm(splitExpenseSchema, fd);
      if (!parsed.ok) return parsed.state;
      ids = await createExpenses(actor, { kind: "split", data: parsed.data }, files);
    } else {
      const parsed = parseForm(expenseSchema, fd);
      if (!parsed.ok) return parsed.state;
      ids = await createExpenses(actor, { kind: "single", data: parsed.data }, files);
    }
    refresh();
    redirect(`/expenses/${ids[0]}?saved=${ids.length}`);
  });
}

export async function createLabourPaymentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(labourPaymentSchema, fd);
    if (!parsed.ok) return parsed.state;
    const data = parsed.data as ExpenseInput & { workerId: number };
    const [id] = await createExpenses(actor, { kind: "labour", data }, filesFrom(fd, "files"));
    refresh();
    redirect(`/expenses/${id}?saved=1`);
  });
}

export async function updateExpenseAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(expenseSchema, fd);
    if (!parsed.ok) return parsed.state;
    const removeAttachmentIds = fd.getAll("removeAttachment").map(Number).filter(Number.isInteger);
    await updateExpense(actor, id, parsed.data, { newFiles: filesFrom(fd, "files"), removeAttachmentIds });
    refresh();
    redirect(`/expenses/${id}?updated=1`);
  });
}

export async function approveExpenseAction(id: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const n = await approveExpense(actor, id);
    refresh();
    return { ok: true, message: n > 1 ? `Approved ${n} lines of the split bill.` : "Expense approved." };
  });
}

export async function rejectExpenseAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(rejectSchema, fd);
    if (!parsed.ok) return parsed.state;
    const n = await rejectExpense(actor, id, parsed.data.reason);
    refresh();
    return { ok: true, message: n > 1 ? `Rejected ${n} lines of the split bill.` : "Expense rejected." };
  });
}

export async function deleteExpenseAction(id: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const n = await deleteExpense(actor, id);
    refresh();
    redirect(`/expenses?deleted=${n}`);
  });
}
