"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/forms";
import { vendorSchema } from "@/lib/validation/parties";
import { parseForm, runAction } from "@/server/action-utils";
import { requireUser } from "@/server/auth";
import { createVendor, deleteVendor, updateVendor } from "@/server/services/vendor-service";

export async function createVendorAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(vendorSchema, fd);
    if (!parsed.ok) return parsed.state;
    const vendor = await createVendor(actor, parsed.data);
    redirect(`/vendors/${vendor.id}`);
  });
}

export async function updateVendorAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(vendorSchema, fd);
    if (!parsed.ok) return parsed.state;
    await updateVendor(actor, id, parsed.data);
    revalidatePath("/vendors");
    redirect(`/vendors/${id}`);
  });
}

export async function deleteVendorAction(id: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    await deleteVendor(actor, id);
    revalidatePath("/vendors");
    redirect("/vendors?deleted=1");
  });
}
