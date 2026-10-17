"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/forms";
import { workerSchema } from "@/lib/validation/parties";
import { parseForm, runAction } from "@/server/action-utils";
import { requireUser } from "@/server/auth";
import { createWorker, deleteWorker, updateWorker } from "@/server/services/worker-service";

export async function createWorkerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(workerSchema, fd);
    if (!parsed.ok) return parsed.state;
    const worker = await createWorker(actor, parsed.data);
    redirect(`/workers/${worker.id}`);
  });
}

export async function updateWorkerAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(workerSchema, fd);
    if (!parsed.ok) return parsed.state;
    await updateWorker(actor, id, parsed.data);
    revalidatePath("/workers");
    redirect(`/workers/${id}`);
  });
}

export async function deleteWorkerAction(id: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    await deleteWorker(actor, id);
    revalidatePath("/workers");
    redirect("/workers?deleted=1");
  });
}
