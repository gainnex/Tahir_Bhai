"use client"

import * as React from "react"
import { CalendarIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// Values are "YYYY-MM-DD" strings (what <input type="date"> produced and what the zod
// schemas expect). Converted through local-time Dates only for the calendar UI.

function isoToDate(v: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined
}

function dateToIso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** "2026-10-16" -> "16-10-2026" (app-wide display format) */
function isoToDisplay(v: string): string {
  const [y, m, d] = v.split("-")
  return `${d}-${m}-${y}`
}

type DatePickerProps = Omit<
  React.ComponentProps<"button">,
  "value" | "defaultValue" | "onChange"
> & {
  /** Controlled "YYYY-MM-DD" ("" = empty). */
  value?: string
  /** Uncontrolled initial value, for plain GET forms. */
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Submitted as a hidden input, so FormData / GET forms keep working. */
  name?: string
  placeholder?: string
  /** Show a clear button when a date is set (optional dates and filters). */
  clearable?: boolean
}

/** Date field: Popover + Calendar (react-day-picker), shadcn "date picker" pattern. */
function DatePicker({
  value,
  defaultValue = "",
  onValueChange,
  name,
  placeholder = "Pick a date",
  clearable,
  disabled,
  className,
  wrapperClassName,
  ...props
}: DatePickerProps & { wrapperClassName?: string }) {
  const [open, setOpen] = React.useState(false)
  const [inner, setInner] = React.useState(defaultValue)
  const current = value ?? inner
  const date = isoToDate(current)

  function set(v: string) {
    if (value === undefined) setInner(v)
    onValueChange?.(v)
  }

  return (
    <div className={cn("relative", wrapperClassName)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start border-input bg-card px-3 font-normal tabular-nums shadow-xs aria-invalid:border-destructive",
              !date && "text-muted-foreground",
              clearable && date && "pr-9",
              className
            )}
            {...props}
          >
            <CalendarIcon className="size-4 shrink-0 opacity-60" />
            {date ? isoToDisplay(current) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            defaultMonth={date}
            captionLayout="dropdown"
            startMonth={new Date(2000, 0)}
            endMonth={new Date(new Date().getFullYear() + 5, 11)}
            weekStartsOn={1}
            onSelect={(d) => {
              if (d) set(dateToIso(d))
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      {clearable && date && !disabled && (
        <button
          type="button"
          onClick={() => set("")}
          aria-label="Clear date"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
      {name && (
        <input type="hidden" name={name} value={current} disabled={disabled} />
      )}
    </div>
  )
}

export { DatePicker }
