"use client";

import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { FormStatus } from "@/components/forms/form-status";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/forms";
import { cn } from "@/lib/utils";
import {
  ATTENDANCE_CODES,
  ATTENDANCE_LABELS,
  ATTENDANCE_STATUSES,
  type AttendanceStatus,
} from "@/lib/validation/payroll";

const ACTIVE: Record<AttendanceStatus, string> = {
  PRESENT: "bg-emerald-600 text-white border-emerald-600",
  HALF_DAY: "bg-amber-500 text-white border-amber-500",
  ABSENT: "bg-destructive text-white border-destructive",
  LEAVE: "bg-sky-600 text-white border-sky-600",
};

export type SheetRow = { id: number; name: string; sub: string; inactive?: boolean };

/** One day's attendance: tap P / H / A / L per employee (tap again to clear), then save. */
export function AttendanceSheet({
  date,
  rows,
  marks: initial,
  action,
  readOnly,
}: {
  date: string;
  rows: SheetRow[];
  marks: Record<number, AttendanceStatus>;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  /** Future dates can be viewed but not marked */
  readOnly?: boolean;
}) {
  const [marks, setMarks] = useState<Record<number, AttendanceStatus | undefined>>(initial);
  const f = useFormAction(action);
  const unmarked = rows.filter((r) => !marks[r.id]).length;
  const count = (s: AttendanceStatus) => rows.filter((r) => marks[r.id] === s).length;

  function set(id: number, s: AttendanceStatus) {
    setMarks((m) => ({ ...m, [id]: m[id] === s ? undefined : s }));
  }

  return (
    <form onSubmit={f.onSubmit} className="space-y-4">
      <input type="hidden" name="date" value={date} />
      <FormStatus error={f.formError} success={f.success} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {ATTENDANCE_STATUSES.map((s) => `${count(s)} ${ATTENDANCE_LABELS[s].toLowerCase()}`).join(" · ")} · {unmarked} not
          marked
        </p>
        {!readOnly && unmarked > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMarks((m) => Object.fromEntries(rows.map((r) => [r.id, m[r.id] ?? "PRESENT"])))}
          >
            <CheckCheck /> Mark the rest present
          </Button>
        )}
      </div>

      <ul className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card shadow-xs">
        {rows.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">No employees to mark.</li>}
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <input type="hidden" name={`status_${r.id}`} value={marks[r.id] ?? ""} />
            <div className="min-w-0">
              <div className="truncate font-medium">
                {r.name}
                {r.inactive && <span className="ml-2 text-xs font-normal text-muted-foreground">(inactive)</span>}
              </div>
              <div className="truncate text-xs text-muted-foreground">{r.sub}</div>
            </div>
            <div className="flex gap-1.5" role="radiogroup" aria-label={`Attendance for ${r.name}`}>
              {ATTENDANCE_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={marks[r.id] === s}
                  title={ATTENDANCE_LABELS[s]}
                  disabled={readOnly}
                  onClick={() => set(r.id, s)}
                  className={cn(
                    "h-10 min-w-10 flex-1 rounded-md border px-2 text-sm font-semibold transition-colors sm:h-8 sm:flex-none sm:text-xs",
                    marks[r.id] === s ? ACTIVE[s] : "bg-background text-muted-foreground hover:bg-muted",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                  )}
                >
                  <span className="sm:hidden">{ATTENDANCE_CODES[s]}</span>
                  <span className="hidden sm:inline">{ATTENDANCE_LABELS[s]}</span>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {!readOnly && rows.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card p-3 sm:static sm:border-0 sm:bg-transparent sm:p-0">
          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={f.pending}>
            {f.pending ? "Saving…" : "Save attendance"}
          </Button>
        </div>
      )}
    </form>
  );
}
