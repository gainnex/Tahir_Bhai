import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { logActivity } from "./activity-log";

export const MIN_PASSWORD_LENGTH = 8;

// Compared against for unknown users so a failed login takes the same time either way.
let dummyHash: string | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("not-a-real-password", 10));

/** Check credentials. `login` may be the username or the email. Returns the user id. */
export async function authenticate(login: string, password: string) {
  const value = login.trim().toLowerCase();
  const user = await db.user.findFirst({
    where: value.includes("@") ? { email: value } : { username: value },
  });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? getDummyHash());
  if (!user || !ok) throw new AppError("Invalid username or password.");
  if (!user.isActive) throw new AppError("This account has been deactivated. Contact the administrator.");

  await logActivity({ userId: user.id, action: "LOGIN", entityType: "user", entityId: user.id });
  return user;
}

export async function hashPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  return bcrypt.hash(password, 10);
}

/** A user changing their own password (also clears the "must change" flag). */
export async function changeOwnPassword(userId: number, currentPassword: string, newPassword: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError("Current password is incorrect.");
  }
  if (currentPassword === newPassword) {
    throw new AppError("New password must be different from the current password.");
  }
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
  });
  // Never log password values, only that it changed.
  await logActivity({
    userId,
    action: "UPDATE",
    entityType: "user",
    entityId: userId,
    changes: { password: { old: "***", new: "***" } },
  });
}
