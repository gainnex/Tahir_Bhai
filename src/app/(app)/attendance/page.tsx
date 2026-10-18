import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Field } from "@/components/forms/field";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/notice";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { formatDate, todayPK } from "@/lib/format";
import { can } from "@/lib/permissions";
import { EMPLOYEE_TYPE_LABELS } from "@/lib/validation/parties";
import { requireUser } from "@/server/auth";
import { getAttendanceDay } from "@/server/services/payroll-service";
import { saveAttendanceAction } from "./actions";
import { AttendanceSheet } from "./attendance-sheet";

export const metadata = { title: "Attendance" };

function shiftDay(date: string, delta: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default async function AttendancePage({ searchParams }: PageProps<"/attendance">) {
  const actor = await requireUser();
  const sp = await searchParams;
  const today = todayPK();
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const { workers, marks } = await getAttendanceDay(actor, date);
  const future = date > today;
  const weekday = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });

  return (
    <>
      <PageHeader
        title="Attendance"
        description={`${weekday}, ${formatDate(date)}`}
        actions={
          <Link href={`/attendance/register?month=${date.slice(0, 7)}`} className={buttonVariants({ variant: "outline" })}>
            <CalendarDays /> Monthly register
          </Link>
        }
      />

      <Card className="mb-4 py-3 sm:py-4">
        <CardContent className="flex flex-wrap items-end gap-2 px-3 sm:px-4">
          <Link href={`/attendance?date=${shiftDay(date, -1)}`} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Previous day">
            <ChevronLeft />
          </Link>
          <form className="flex items-end gap-2">
            <Field label="Date" className="w-44">
              <DatePicker name="date" defaultValue={date} />
            </Field>
            <Button type="submit" variant="secondary">
              <Search /> Go
            </Button>
          </form>
          {date < today && (
            <Link href={`/attendance?date=${shiftDay(date, 1)}`} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Next day">
              <ChevronRight />
            </Link>
          )}
          {date !== today && (
            <Link href="/attendance" className={buttonVariants({ variant: "ghost" })}>
              Today
            </Link>
          )}
        </CardContent>
      </Card>

      {future && (
        <Notice variant="warning" className="mb-4">
          This date is in the future — attendance can only be marked for today or earlier.
        </Notice>
      )}
      {!can.markAllAttendance(actor.role) && (
        <Notice className="mb-4">You can mark employees whose default project is one of your assigned projects.</Notice>
      )}

      <AttendanceSheet
        key={date}
        date={date}
        readOnly={future}
        action={saveAttendanceAction}
        marks={marks}
        rows={workers.map((w) => ({
          id: w.id,
          name: w.name,
          inactive: !w.isActive,
          sub: [w.designation ?? EMPLOYEE_TYPE_LABELS[w.employeeType], w.defaultProject?.code].filter(Boolean).join(" · "),
        }))}
      />
      <p className="mt-3 mb-20 text-xs text-muted-foreground sm:mb-0">
        Wages: daily-rate workers are paid for present days (half days count half); leave and unmarked days are unpaid.
        Monthly staff are paid in full less absent days and half of each half day; leave and unmarked days are paid.
      </p>
    </>
  );
}
