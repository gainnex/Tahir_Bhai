"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/forms";
import {
  companySettingsSchema,
  createUserSchema,
  headNameSchema,
  resetPasswordSchema,
  updateUserSchema,
} from "@/lib/validation/settings";
import { parseForm, runAction } from "@/server/action-utils";
import { requireUser } from "@/server/auth";
import * as heads from "@/server/services/head-service";
import { updateCompanySettings } from "@/server/services/settings-service";
import * as users from "@/server/services/user-service";

// Thin wrappers: authenticate, validate, call the service. Permission checks and
// business rules live in the services.

export async function saveCompanySettings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(companySettingsSchema, fd);
    if (!parsed.ok) return parsed.state;
    const logo = fd.get("logo");
    await updateCompanySettings(actor, parsed.data, logo instanceof File ? logo : null);
    revalidatePath("/", "layout");
    return { ok: true, message: "Settings saved." };
  });
}

// ---- Users ----

export async function createUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(createUserSchema, fd);
    if (!parsed.ok) return parsed.state;
    await users.createUser(actor, parsed.data);
    redirect("/settings/users?created=1");
  });
}

export async function updateUserAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(updateUserSchema, fd);
    if (!parsed.ok) return parsed.state;
    await users.updateUser(actor, id, parsed.data);
    revalidatePath("/settings/users");
    return { ok: true, message: "User saved." };
  });
}

export async function resetPasswordAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(resetPasswordSchema, fd);
    if (!parsed.ok) return parsed.state;
    await users.resetUserPassword(actor, id, parsed.data.password);
    return { ok: true, message: "Password reset. The user must choose a new password at next login." };
  });
}

// ---- Expense heads ----

async function headAction(fn: (actor: Awaited<ReturnType<typeof requireUser>>) => Promise<void>) {
  return runAction(async () => {
    const actor = await requireUser();
    await fn(actor);
    revalidatePath("/settings/heads");
    return { ok: true };
  });
}

export async function createHeadAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(headNameSchema, fd);
  if (!parsed.ok) return parsed.state;
  return headAction((a) => heads.createHead(a, parsed.data.name));
}

export async function renameHeadAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(headNameSchema, fd);
  if (!parsed.ok) return parsed.state;
  return headAction((a) => heads.renameHead(a, id, parsed.data.name));
}

export async function setHeadActiveAction(id: number, isActive: boolean): Promise<ActionState> {
  return headAction((a) => heads.setHeadActive(a, id, isActive));
}

export async function moveHeadAction(id: number, direction: "up" | "down"): Promise<ActionState> {
  return headAction((a) => heads.moveHead(a, id, direction));
}

export async function createSubheadAction(headId: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(headNameSchema, fd);
  if (!parsed.ok) return parsed.state;
  return headAction((a) => heads.createSubhead(a, headId, parsed.data.name));
}

export async function renameSubheadAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(headNameSchema, fd);
  if (!parsed.ok) return parsed.state;
  return headAction((a) => heads.renameSubhead(a, id, parsed.data.name));
}

export async function setSubheadActiveAction(id: number, isActive: boolean): Promise<ActionState> {
  return headAction((a) => heads.setSubheadActive(a, id, isActive));
}
