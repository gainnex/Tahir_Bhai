import { db } from "@/lib/db";
import type { Role } from "@/lib/permissions";
import type { Actor } from "@/server/guards";

let n = 0;

/** Create a user with the given role and return it as an Actor. */
export async function makeUser(role: Role, extra: { isActive?: boolean } = {}): Promise<Actor & { username: string }> {
  n += 1;
  const user = await db.user.create({
    data: {
      name: `${role} ${n}`,
      username: `${role.toLowerCase()}_${n}_${Date.now()}`,
      passwordHash: "x",
      role,
      isActive: extra.isActive ?? true,
    },
  });
  return { id: user.id, role: user.role, username: user.username };
}

export async function admin(): Promise<Actor> {
  const u = await db.user.findUniqueOrThrow({ where: { username: "admin" } });
  return { id: u.id, role: u.role };
}
