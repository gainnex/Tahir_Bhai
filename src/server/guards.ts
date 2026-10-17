import { Prisma } from "@prisma/client";
import { ForbiddenError } from "@/lib/errors";
import { can, type Role } from "@/lib/permissions";

/** The user performing a service call. */
export type Actor = { id: number; role: Role };

/** Throw unless the actor's role passes the given permission check. */
export function assertCan(actor: Actor, check: keyof typeof can, message?: string) {
  if (!can[check](actor.role)) throw new ForbiddenError(message);
}

/** True for a unique-constraint violation (optionally on a given field). */
export function isUniqueError(e: unknown, field?: string) {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return false;
  if (!field) return true;
  const target = e.meta?.target;
  return Array.isArray(target) ? target.some((t) => String(t).includes(field)) : String(target).includes(field);
}
