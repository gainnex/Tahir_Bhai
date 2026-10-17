import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import type { CreateUserInput, UpdateUserInput } from "@/lib/validation/settings";
import { assertCan, isUniqueError, type Actor } from "@/server/guards";
import { diffChanges, logActivity, snapshot } from "./activity-log";
import { hashPassword } from "./auth-service";

const publicFields = {
  id: true,
  name: true,
  username: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
} as const;

export async function listUsers(actor: Actor) {
  assertCan(actor, "manageSettings");
  return db.user.findMany({
    select: { ...publicFields, _count: { select: { projects: true } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

export async function getUser(actor: Actor, id: number) {
  assertCan(actor, "manageSettings");
  const user = await db.user.findUnique({
    where: { id },
    select: {
      ...publicFields,
      projects: {
        where: { project: { deletedAt: null } },
        select: { project: { select: { id: true, code: true, name: true, status: true } } },
      },
    },
  });
  if (!user) throw new NotFoundError("User");
  return user;
}

function uniqueMessage(e: unknown): never {
  if (isUniqueError(e, "username")) throw new AppError("This username is already taken.");
  if (isUniqueError(e, "email")) throw new AppError("This email is already used by another user.");
  throw e;
}

export async function createUser(actor: Actor, input: CreateUserInput) {
  assertCan(actor, "manageSettings");
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          username: input.username,
          email: input.email,
          role: input.role,
          passwordHash,
        },
      });
      await logActivity(
        {
          userId: actor.id,
          action: "CREATE",
          entityType: "user",
          entityId: user.id,
          changes: snapshot(user, ["passwordHash"]),
        },
        tx,
      );
      return user;
    });
  } catch (e) {
    uniqueMessage(e);
  }
}

/** There must always be at least one active admin who can log in. */
async function assertAnotherActiveAdmin(excludingUserId: number) {
  const others = await db.user.count({
    where: { role: "ADMIN", isActive: true, id: { not: excludingUserId } },
  });
  if (others === 0) {
    throw new AppError("This is the only active admin. Make another user an admin first.");
  }
}

export async function updateUser(actor: Actor, id: number, input: UpdateUserInput) {
  assertCan(actor, "manageSettings");
  const before = await db.user.findUnique({ where: { id } });
  if (!before) throw new NotFoundError("User");

  if (id === actor.id && !input.isActive) throw new AppError("You cannot deactivate your own account.");
  const losingAdmin = before.role === "ADMIN" && before.isActive && (input.role !== "ADMIN" || !input.isActive);
  if (losingAdmin) await assertAnotherActiveAdmin(id);

  const data = {
    name: input.name,
    username: input.username,
    email: input.email,
    role: input.role,
    isActive: input.isActive,
  };
  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data });
      // Project assignments only apply to site in-charges.
      if (before.role === "SITE_INCHARGE" && input.role !== "SITE_INCHARGE") {
        await tx.projectUser.deleteMany({ where: { userId: id } });
      }
      const changes = diffChanges(before, data);
      if (Object.keys(changes).length) {
        await logActivity({ userId: actor.id, action: "UPDATE", entityType: "user", entityId: id, changes }, tx);
      }
    });
  } catch (e) {
    uniqueMessage(e);
  }
}

/** Admin sets a new password for a user. */
export async function resetUserPassword(actor: Actor, id: number, newPassword: string) {
  assertCan(actor, "manageSettings");
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError("User");
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
    });
    await logActivity(
      {
        userId: actor.id,
        action: "UPDATE",
        entityType: "user",
        entityId: id,
        changes: { password: { old: "***", new: "*** (reset by admin)" } },
      },
      tx,
    );
  });
}
