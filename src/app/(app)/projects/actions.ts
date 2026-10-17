"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/forms";
import { projectSchema } from "@/lib/validation/projects";
import { parseForm, runAction } from "@/server/action-utils";
import { requireUser } from "@/server/auth";
import { createProject, deleteProject, updateProject } from "@/server/services/project-service";

export async function createProjectAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(projectSchema, fd);
    if (!parsed.ok) return parsed.state;
    const project = await createProject(actor, parsed.data);
    redirect(`/projects/${project!.id}`);
  });
}

export async function updateProjectAction(id: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = parseForm(projectSchema, fd);
    if (!parsed.ok) return parsed.state;
    await updateProject(actor, id, parsed.data);
    revalidatePath("/projects");
    redirect(`/projects/${id}`);
  });
}

export async function deleteProjectAction(id: number): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    await deleteProject(actor, id);
    revalidatePath("/projects");
    redirect("/projects?deleted=1");
  });
}
