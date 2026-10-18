"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/forms";
import { cashEntrySchema } from "@/lib/validation/cash";
import { parseForm, runAction } from "@/server/action-utils";
import { requireUser } from "@/server/auth";
import { createCashEntry, deleteCashEntry, updateCashEntry } from "@/server/services/cash-service";

export async function createCashEntryAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(cashEntrySchema, fd);
    if (!parsed.ok) return parsed.state;
    const entry = await createCashEntry(actor, parsed.data);
    revalidatePath("/cash");
    redirect(`/cash/${entry.workerId}?saved=${entry.entryNo}`);
  });
}

export async function updateCashEntryAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(cashEntrySchema, fd);
    if (!parsed.ok) return parsed.state;
    await updateCashEntry(actor, id, parsed.data);
    revalidatePath("/cash");
    redirect(`/cash/${parsed.data.workerId}`);
  });
}

export async function deleteCashEntryAction(id: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const workerId = await deleteCashEntry(actor, id);
    revalidatePath("/cash");
    redirect(`/cash/${workerId}?deleted=1`);
  });
}
