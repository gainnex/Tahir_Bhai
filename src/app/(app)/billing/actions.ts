"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/forms";
import { clientBillSchema, clientReceiptSchema, verifyBillSchema } from "@/lib/validation/billing";
import { parseForm, runAction } from "@/server/action-utils";
import { requireUser } from "@/server/auth";
import {
  createBill,
  createReceipt,
  deleteBill,
  deleteReceipt,
  unverifyBill,
  updateBill,
  updateReceipt,
  verifyBill,
} from "@/server/services/billing-service";

export async function createBillAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(clientBillSchema, fd);
    if (!parsed.ok) return parsed.state;
    const bill = await createBill(actor, parsed.data);
    revalidatePath("/billing");
    redirect(`/billing/${bill.id}?saved=${bill.billNo}`);
  });
}

export async function updateBillAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(clientBillSchema, fd);
    if (!parsed.ok) return parsed.state;
    await updateBill(actor, id, parsed.data);
    revalidatePath("/billing");
    redirect(`/billing/${id}`);
  });
}

export async function deleteBillAction(id: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    await deleteBill(actor, id);
    revalidatePath("/billing");
    redirect("/billing?deleted=1");
  });
}

export async function verifyBillAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(verifyBillSchema, fd);
    if (!parsed.ok) return parsed.state;
    await verifyBill(actor, id, parsed.data);
    revalidatePath("/billing");
    revalidatePath(`/billing/${id}`);
    return { ok: true, message: "Verification saved." };
  });
}

export async function unverifyBillAction(id: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    await unverifyBill(actor, id);
    revalidatePath("/billing");
    redirect(`/billing/${id}`);
  });
}

export async function createReceiptAction(billId: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(clientReceiptSchema, fd);
    if (!parsed.ok) return parsed.state;
    const r = await createReceipt(actor, billId, parsed.data);
    revalidatePath("/billing");
    redirect(`/billing/${billId}?receipt=${r.id}`);
  });
}

export async function updateReceiptAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(clientReceiptSchema, fd);
    if (!parsed.ok) return parsed.state;
    const billId = await updateReceipt(actor, id, parsed.data);
    revalidatePath("/billing");
    redirect(`/billing/${billId}`);
  });
}

export async function deleteReceiptAction(id: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const billId = await deleteReceipt(actor, id);
    revalidatePath("/billing");
    redirect(`/billing/${billId}?receiptDeleted=1`);
  });
}
