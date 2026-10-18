// Attendance and wage maths (changes/changes.pdf §3: "daily attendance (office), with automatic
// wage calculation from attendance × rate"). Pure and client-safe; money in integer paisa.

import { fromPaisa, toPaisa } from "@/lib/money";

export type AttendanceCounts = { present: number; halfDay: number; absent: number; leave: number };

/** "2026-10" -> 31 */
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "2026-10" -> { from: "2026-10-01", to: "2026-10-31" } */
export function monthRange(month: string) {
  return { from: `${month}-01`, to: `${month}-${String(daysInMonth(month)).padStart(2, "0")}` };
}

/** "2026-10" -> "2026-09" (delta -1) */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Valid "YYYY-MM" or undefined. */
export function parseMonth(v: unknown): string | undefined {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : undefined;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2026-10" -> "October 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Days paid for: a half day counts as half. */
export function payableDays(rateType: "DAILY" | "MONTHLY", c: AttendanceCounts, days: number): number {
  if (rateType === "DAILY") return c.present + c.halfDay / 2;
  return Math.max(0, days - c.absent - c.halfDay / 2);
}

/**
 * Basic pay for one month from attendance, rounded half-up to the paisa.
 *  - Daily rate: rate × (present + ½ half days). Leave and unmarked days are unpaid.
 *  - Monthly rate: the full salary less (absent + ½ half days) × salary ÷ days in the month.
 *    Leave and unmarked days are paid.
 */
export function basicPay(rateType: "DAILY" | "MONTHLY", rate: string, c: AttendanceCounts, days: number): string {
  const r = toPaisa(rate);
  if (rateType === "DAILY") {
    const halves = BigInt(2 * c.present + c.halfDay);
    return fromPaisa((r * halves + 1n) / 2n);
  }
  const paidHalves = BigInt(Math.max(0, 2 * days - 2 * c.absent - c.halfDay));
  const denom = BigInt(2 * days);
  return fromPaisa((r * paidHalves * 2n + denom) / (2n * denom));
}
