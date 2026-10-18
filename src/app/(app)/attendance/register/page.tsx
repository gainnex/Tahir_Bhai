import Link from "next/link";
import { ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { todayPK } from "@/lib/format";
import { monthLabel, parseMonth, shiftMonth } from "@/lib/payroll";
import { cn } from "@/lib/utils";
import { EMPLOYEE_TYPE_LABELS } from "@/lib/validation/parties";
import { requireUser } from "@/server/auth";
import { getAttendanceRegister } from "@/server/services/payroll-service";

export const metadata = { title: "Attendance register" };

const CODE_STYLE: Record<string, string> = {
  P: "text-emerald-700",
  H: "text-amber-600",
  A: "text-destructive font-semibold",
  L: "text-sky-700",
};

export default async function AttendanceRegisterPage({ searchParams }: PageProps<"/attendance/register">) {
  const actor = await requireUser();
  const sp = await searchParams;
  const thisMonth = todayPK().slice(0, 7);
  const month = parseMonth(sp.month) ?? thisMonth;
  const { days, rows } = await getAttendanceRegister(actor, month);
  const dayNumbers = Array.from({ length: days }, (_, i) => i + 1);
  const weekend = (d: number) => new Date(`${month}-${String(d).padStart(2, "0")}T00:00:00Z`).getUTCDay() === 0; // Sunday

  return (
    <>
      <PageHeader
        title={`Attendance register — ${monthLabel(month)}`}
        description="P present · H half day · A absent · L leave. Click a day to mark or correct it."
        actions={
          <>
            <Link href={`/attendance/register?month=${shiftMonth(month, -1)}`} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Previous month">
              <ChevronLeft />
            </Link>
            {month < thisMonth && (
              <Link href={`/attendance/register?month=${shiftMonth(month, 1)}`} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Next month">
                <ChevronRight />
              </Link>
            )}
            <Link href="/attendance" className={buttonVariants()}>
              <ClipboardCheck /> Mark today
            </Link>
          </>
        }
      />

      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card shadow-xs">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40">
              <th className="sticky left-0 z-10 min-w-44 bg-muted px-3 py-2 text-left font-medium">Employee</th>
              {dayNumbers.map((d) => (
                <th key={d} className={cn("w-7 px-0.5 py-2 text-center font-mono font-medium", weekend(d) && "text-muted-foreground/60")}>
                  <Link href={`/attendance?date=${month}-${String(d).padStart(2, "0")}`} className="hover:text-primary hover:underline">
                    {d}
                  </Link>
                </th>
              ))}
              <th className="px-2 py-2 text-center font-medium text-emerald-700">P</th>
              <th className="px-2 py-2 text-center font-medium text-amber-600">H</th>
              <th className="px-2 py-2 text-center font-medium text-destructive">A</th>
              <th className="px-2 py-2 text-center font-medium text-sky-700">L</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={days + 5} className="py-8 text-center text-sm text-muted-foreground">
                  No employees.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.worker.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                  <Link href={`/workers/${r.worker.id}`} className="font-medium text-primary hover:underline">
                    {r.worker.name}
                  </Link>
                  <div className="text-[11px] text-muted-foreground">
                    {r.worker.designation ?? EMPLOYEE_TYPE_LABELS[r.worker.employeeType]}
                  </div>
                </td>
                {r.codes.map((c, i) => (
                  <td key={i} className={cn("px-0.5 text-center font-mono", c ? CODE_STYLE[c] : "text-muted-foreground/40", weekend(i + 1) && "bg-muted/30")}>
                    {c ?? "·"}
                  </td>
                ))}
                <td className="px-2 text-center font-mono tabular-nums">{r.counts.present}</td>
                <td className="px-2 text-center font-mono tabular-nums">{r.counts.halfDay}</td>
                <td className="px-2 text-center font-mono tabular-nums">{r.counts.absent}</td>
                <td className="px-2 text-center font-mono tabular-nums">{r.counts.leave}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
