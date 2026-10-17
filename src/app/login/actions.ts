"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { errorMessage } from "@/lib/errors";
import { getSession } from "@/server/auth";
import { authenticate } from "@/server/services/auth-service";

const loginSchema = z.object({
  login: z.string().trim().min(1, "Enter your username or email"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export type LoginState = { error?: string; login?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, login: String(formData.get("login") ?? "") };
  }
  const { login, password, next } = parsed.data;

  let user;
  try {
    user = await authenticate(login, password);
  } catch (e) {
    return { error: errorMessage(e), login };
  }

  const session = await getSession();
  session.userId = user.id;
  session.role = user.role;
  await session.save();

  // Only allow local redirects
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
