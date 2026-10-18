"use server";

import { revalidatePath } from "next/cache";
import { plural } from "@/lib/format";
import { zodFieldErrors, type ActionState } from "@/lib/forms";
import { attendanceFromForm, attendanceSheetSchema } from "@/lib/validation/payroll";
import { runAction } from "@/server/action-utils";
import { requireUser } from "@/server/auth";
import { saveAttendance } from "@/server/services/payroll-service";

export async function saveAttendanceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const parsed = attendanceSheetSchema.safeParse(attendanceFromForm(fd));
    if (!parsed.success) {
      const fieldErrors = zodFieldErrors(parsed.error);
      return { error: fieldErrors.date ?? "The attendance sheet could not be read. Reload the page and try again.", fieldErrors };
    }
    const n = await saveAttendance(actor, parsed.data);
    revalidatePath("/attendance");
    revalidatePath("/payroll");
    return { ok: true, message: n ? `Attendance saved — ${plural(n, "employee")} updated.` : "Nothing changed." };
  });
}
