import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { createUserSchema } from "@/lib/validation/settings";
import * as heads from "@/server/services/head-service";
import { getSettings, updateCompanySettings } from "@/server/services/settings-service";
import * as users from "@/server/services/user-service";
import { admin, makeUser } from "./helpers";

describe("settings", () => {
  it("only admin can change company settings, and changes are logged", async () => {
    const accountant = await makeUser("ACCOUNTANT");
    const input = {
      companyName: "Test Builders",
      companyAddress: null,
      currencyLabel: "PKR",
      autoApprovePrivileged: false,
      removeLogo: false,
    };
    await expect(updateCompanySettings(accountant, input)).rejects.toBeInstanceOf(ForbiddenError);

    const a = await admin();
    await updateCompanySettings(a, input);
    const s = await getSettings();
    expect(s.companyName).toBe("Test Builders");
    expect(s.autoApprovePrivileged).toBe(false);

    const log = await db.activityLog.findFirst({ where: { entityType: "settings" }, orderBy: { id: "desc" } });
    expect(log?.changes).toMatchObject({ auto_approve_privileged: { old: "true", new: "false" } });

    await updateCompanySettings(a, { ...input, autoApprovePrivileged: true });
  });
});

describe("users", () => {
  it("validates username and matching passwords", () => {
    const bad = createUserSchema.safeParse({
      name: "X",
      username: "has space",
      role: "ADMIN",
      password: "12345678",
      confirmPassword: "different",
    });
    expect(bad.success).toBe(false);
    const ok = createUserSchema.parse({
      name: "X",
      username: "Ali.Khan",
      role: "SITE_INCHARGE",
      password: "12345678",
      confirmPassword: "12345678",
    });
    expect(ok.username).toBe("ali.khan"); // stored lower-case
  });

  it("creates users without a forced password change and rejects duplicate usernames", async () => {
    const a = await admin();
    const input = {
      name: "New Person",
      username: "newperson",
      email: "new@example.com",
      role: "SITE_INCHARGE" as const,
      password: "secret123",
      confirmPassword: "secret123",
    };
    const u = await users.createUser(a, input);
    expect(u?.mustChangePassword).toBe(false);
    await expect(users.createUser(a, { ...input, email: null })).rejects.toThrow("username is already taken");
  });

  it("never leaves the system without an active admin", async () => {
    const a = await admin();
    await expect(
      users.updateUser(a, a.id, { name: "Administrator", username: "admin", email: null, role: "ACCOUNTANT", isActive: true }),
    ).rejects.toThrow("only active admin");
    await expect(
      users.updateUser(a, a.id, { name: "Administrator", username: "admin", email: null, role: "ADMIN", isActive: false }),
    ).rejects.toThrow("cannot deactivate your own account");
  });

  it("non-admins cannot manage users", async () => {
    const acc = await makeUser("ACCOUNTANT");
    await expect(users.listUsers(acc)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("expense heads", () => {
  it("adds, renames and disables heads and sub-heads; names stay unique", async () => {
    const a = await admin();
    await heads.createHead(a, "Testing Head");
    await expect(heads.createHead(a, "Testing Head")).rejects.toThrow("already exists");

    const head = await db.expenseHead.findUniqueOrThrow({ where: { name: "Testing Head" } });
    await heads.createSubhead(a, head.id, "Alpha");
    await expect(heads.createSubhead(a, head.id, "Alpha")).rejects.toThrow("already has a sub-head");
    // Same sub-head name under a different head is fine
    const misc = await db.expenseHead.findUniqueOrThrow({ where: { name: "Miscellaneous" } });
    await heads.createSubhead(a, misc.id, "Alpha");

    await heads.renameHead(a, head.id, "Renamed Head");
    await heads.setHeadActive(a, head.id, false);

    const active = await heads.listActiveHeads();
    expect(active.find((h) => h.id === head.id)).toBeUndefined();
    const miscActive = active.find((h) => h.id === misc.id)!;
    const alpha = miscActive.subheads.find((s) => s.name === "Alpha")!;
    await heads.setSubheadActive(a, alpha.id, false);
    const after = await heads.listActiveHeads();
    expect(after.find((h) => h.id === misc.id)!.subheads.some((s) => s.name === "Alpha")).toBe(false);

    const logs = await db.activityLog.count({ where: { entityType: { in: ["expense_head", "expense_subhead"] } } });
    expect(logs).toBeGreaterThanOrEqual(6);
  });

  it("reorders heads", async () => {
    const a = await admin();
    const before = await heads.listHeadTree();
    await heads.moveHead(a, before[1].id, "up");
    const after = await heads.listHeadTree();
    expect(after[0].id).toBe(before[1].id);
    expect(after[1].id).toBe(before[0].id);
  });
});

describe("logo upload", () => {
  const input = {
    companyName: "Test Builders",
    companyAddress: null,
    currencyLabel: "PKR",
    autoApprovePrivileged: true,
    removeLogo: false,
  };
  // Smallest valid PNG header bytes are enough for type sniffing
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

  it("accepts a PNG and rejects files whose content is not an image", async () => {
    const a = await admin();
    await updateCompanySettings(a, input, new File([png], "logo.png", { type: "image/png" }));
    expect((await getSettings()).logoPath).toMatch(/^logo\/\d{4}\/\d{2}\/.+\.png$/);

    // A text file renamed to .png is refused (type is checked from content)
    const fake = new File(["hello"], "fake.png", { type: "image/png" });
    await expect(updateCompanySettings(a, input, fake)).rejects.toThrow("not an allowed file type");

    await updateCompanySettings(a, { ...input, removeLogo: true });
    expect((await getSettings()).logoPath).toBe("");
  });
});
