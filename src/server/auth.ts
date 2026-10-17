import { cache } from "react";
import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { db } from "@/lib/db";
import type { Role } from "@/lib/permissions";
import { sessionOptions, type SessionData } from "@/lib/session";

export type CurrentUser = {
  id: number;
  name: string;
  username: string;
  role: Role;
  mustChangePassword: boolean;
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

/** The logged-in, active user, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session.userId) return null;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, username: true, role: true, isActive: true, mustChangePassword: true },
  });
  if (!user || !user.isActive) return null;
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
});

/**
 * For pages and server actions: returns the user or redirects to /login.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Like requireUser, but also checks the role; otherwise renders app/forbidden.tsx (403). */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) forbidden();
  return user;
}
