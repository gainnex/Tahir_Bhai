import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { assertCan, isUniqueError, type Actor } from "@/server/guards";
import { logActivity } from "./activity-log";

// Expense heads & sub-heads (docs/FEATURES.md §2): add, rename, disable — never delete,
// so old expenses always keep their head/sub-head.

/** Full tree for the settings page, with how many expenses use each item. */
export async function listHeadTree() {
  return db.expenseHead.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { expenses: { where: { deletedAt: null } } } },
      subheads: {
        orderBy: { name: "asc" },
        include: { _count: { select: { expenses: { where: { deletedAt: null } } } } },
      },
    },
  });
}

/** Active heads with their active sub-heads — the only ones allowed on new expenses. */
export async function listActiveHeads() {
  return db.expenseHead.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      subheads: { where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } },
    },
  });
}

function duplicate(e: unknown, message: string): never {
  if (isUniqueError(e)) throw new AppError(message);
  throw e;
}

export async function createHead(actor: Actor, name: string) {
  assertCan(actor, "manageSettings");
  const last = await db.expenseHead.aggregate({ _max: { sortOrder: true } });
  try {
    await db.$transaction(async (tx) => {
      const head = await tx.expenseHead.create({
        data: { name, sortOrder: (last._max.sortOrder ?? 0) + 10 },
      });
      await logActivity(
        { userId: actor.id, action: "CREATE", entityType: "expense_head", entityId: head.id, changes: { name } },
        tx,
      );
    });
  } catch (e) {
    duplicate(e, `A head named "${name}" already exists.`);
  }
}

export async function renameHead(actor: Actor, id: number, name: string) {
  assertCan(actor, "manageSettings");
  const head = await db.expenseHead.findUnique({ where: { id } });
  if (!head) throw new NotFoundError("Expense head");
  if (head.name === name) return;
  try {
    await db.$transaction(async (tx) => {
      await tx.expenseHead.update({ where: { id }, data: { name } });
      await logActivity(
        {
          userId: actor.id,
          action: "UPDATE",
          entityType: "expense_head",
          entityId: id,
          changes: { name: { old: head.name, new: name } },
        },
        tx,
      );
    });
  } catch (e) {
    duplicate(e, `A head named "${name}" already exists.`);
  }
}

export async function setHeadActive(actor: Actor, id: number, isActive: boolean) {
  assertCan(actor, "manageSettings");
  const head = await db.expenseHead.findUnique({ where: { id } });
  if (!head) throw new NotFoundError("Expense head");
  if (head.isActive === isActive) return;
  await db.$transaction(async (tx) => {
    await tx.expenseHead.update({ where: { id }, data: { isActive } });
    await logActivity(
      {
        userId: actor.id,
        action: "UPDATE",
        entityType: "expense_head",
        entityId: id,
        changes: { isActive: { old: head.isActive, new: isActive } },
      },
      tx,
    );
  });
}

/** Swap display order with the neighbouring head. */
export async function moveHead(actor: Actor, id: number, direction: "up" | "down") {
  assertCan(actor, "manageSettings");
  const heads = await db.expenseHead.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const i = heads.findIndex((h) => h.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= heads.length) return;
  // Renumber everything so equal sort orders can't get stuck.
  const ordered = [...heads];
  [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  await db.$transaction(
    ordered.map((h, idx) => db.expenseHead.update({ where: { id: h.id }, data: { sortOrder: (idx + 1) * 10 } })),
  );
}

export async function createSubhead(actor: Actor, headId: number, name: string) {
  assertCan(actor, "manageSettings");
  const head = await db.expenseHead.findUnique({ where: { id: headId } });
  if (!head) throw new NotFoundError("Expense head");
  try {
    await db.$transaction(async (tx) => {
      const sub = await tx.expenseSubhead.create({ data: { headId, name } });
      await logActivity(
        {
          userId: actor.id,
          action: "CREATE",
          entityType: "expense_subhead",
          entityId: sub.id,
          changes: { head: head.name, name },
        },
        tx,
      );
    });
  } catch (e) {
    duplicate(e, `"${head.name}" already has a sub-head named "${name}".`);
  }
}

export async function renameSubhead(actor: Actor, id: number, name: string) {
  assertCan(actor, "manageSettings");
  const sub = await db.expenseSubhead.findUnique({ where: { id }, include: { head: true } });
  if (!sub) throw new NotFoundError("Sub-head");
  if (sub.name === name) return;
  try {
    await db.$transaction(async (tx) => {
      await tx.expenseSubhead.update({ where: { id }, data: { name } });
      await logActivity(
        {
          userId: actor.id,
          action: "UPDATE",
          entityType: "expense_subhead",
          entityId: id,
          changes: { name: { old: sub.name, new: name } },
        },
        tx,
      );
    });
  } catch (e) {
    duplicate(e, `"${sub.head.name}" already has a sub-head named "${name}".`);
  }
}

export async function setSubheadActive(actor: Actor, id: number, isActive: boolean) {
  assertCan(actor, "manageSettings");
  const sub = await db.expenseSubhead.findUnique({ where: { id } });
  if (!sub) throw new NotFoundError("Sub-head");
  if (sub.isActive === isActive) return;
  await db.$transaction(async (tx) => {
    await tx.expenseSubhead.update({ where: { id }, data: { isActive } });
    await logActivity(
      {
        userId: actor.id,
        action: "UPDATE",
        entityType: "expense_subhead",
        entityId: id,
        changes: { isActive: { old: sub.isActive, new: isActive } },
      },
      tx,
    );
  });
}
