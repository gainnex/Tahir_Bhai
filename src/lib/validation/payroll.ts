import { z } from "zod";
import { dateField, idField, moneyString, optionalText } from "@/lib/forms";

// Attendance and pay adjustments (changes/changes.pdf §3).

export const ATTENDANCE_STATUSES = ["PRESENT", "HALF_DAY", "ABSENT", "LEAVE"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  HALF_DAY: "Half day",
  ABSENT: "Absent",
  LEAVE: "Leave",
};
/** One-letter codes for the monthly register */
export const ATTENDANCE_CODES: Record<AttendanceStatus, string> = {
  PRESENT: "P",
  HALF_DAY: "H",
  ABSENT: "A",
  LEAVE: "L",
};

export const PAY_ADJUSTMENT_TYPES = ["BENEFIT", "REWARD", "INCENTIVE", "DEDUCTION", "ADVANCE_RECOVERY"] as const;
export type PayAdjustmentType = (typeof PAY_ADJUSTMENT_TYPES)[number];
export const PAY_ADJUSTMENT_LABELS: Record<PayAdjustmentType, string> = {
  BENEFIT: "Benefit",
  REWARD: "Reward",
  INCENTIVE: "Incentive",
  DEDUCTION: "Deduction",
  ADVANCE_RECOVERY: "Advance recovery",
};
/** Types that add to wages; the others are taken off. */
export const PAY_ADDITIONS: PayAdjustmentType[] = ["BENEFIT", "REWARD", "INCENTIVE"];

export const payAdjustmentSchema = z.object({
  date: dateField("Date"),
  workerId: idField("Employee"),
  type: z.enum(PAY_ADJUSTMENT_TYPES, { error: "Select a type" }),
  amount: moneyString("Amount"),
  notes: optionalText(1000),
});
export type PayAdjustmentInput = z.output<typeof payAdjustmentSchema>;

/** One day's attendance sheet: status per employee; null clears the mark. */
export const attendanceSheetSchema = z.object({
  date: dateField("Date"),
  marks: z.array(
    z.object({
      workerId: z.number().int().positive(),
      status: z.enum(ATTENDANCE_STATUSES).nullable(),
    }),
  ),
});
export type AttendanceSheetInput = z.output<typeof attendanceSheetSchema>;

/**
 * The attendance form posts one field per employee: "status_<workerId>" = PRESENT | … | "" (unmarked).
 * (Not "status.<id>": formDataToObject would turn numeric parts into array indexes.)
 */
export function attendanceFromForm(fd: FormData): unknown {
  const marks: { workerId: number; status: string | null }[] = [];
  for (const [key, value] of fd.entries()) {
    const m = /^status_(\d+)$/.exec(key);
    if (m && typeof value === "string") marks.push({ workerId: Number(m[1]), status: value || null });
  }
  return { date: fd.get("date"), marks };
}
