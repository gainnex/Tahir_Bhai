"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/forms";
import { payAdjustmentSchema } from "@/lib/validation/payroll";
import { parseForm, runAction } from "@/server/action-utils";
import { requireUser } from "@/server/auth";
import { createPayAdjustment, deletePayAdjustment, updatePayAdjustment } from "@/server/services/payroll-service";

export async function createPayAdjustmentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(payAdjustmentSchema, fd);
    if (!parsed.ok) return parsed.state;
    const adj = await createPayAdjustment(actor, parsed.data);
    revalidatePath("/payroll");
    redirect(`/payroll?month=${parsed.data.date.slice(0, 7)}&saved=${adj.entryNo}`);
  });
}

export async function updatePayAdjustmentAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(payAdjustmentSchema, fd);
    if (!parsed.ok) return parsed.state;
    await updatePayAdjustment(actor, id, parsed.data);
    revalidatePath("/payroll");
    redirect(`/payroll?month=${parsed.data.date.slice(0, 7)}`);
  });
}

export async function deletePayAdjustmentAction(id: number, month: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    await deletePayAdjustment(actor, id);
    revalidatePath("/payroll");
    redirect(`/payroll?month=${month}&deleted=1`);
  });
}
