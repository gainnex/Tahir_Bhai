"use client"

import * as React from "react"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export type ComboboxOption = {
  value: string
  label: string
  /** Muted text after the label, also searchable (e.g. a project code). */
  hint?: string
  /** Options with the same group are listed under one heading. */
  group?: string
  keywords?: string[]
  disabled?: boolean
}

type ComboboxProps = Omit<
  React.ComponentProps<"button">,
  "value" | "defaultValue" | "onChange"
> & {
  options: ComboboxOption[]
  /** Controlled value ("" = nothing selected). */
  value?: string
  /** Uncontrolled initial value, for plain GET forms. */
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Submitted as a hidden input, so FormData / GET forms keep working. */
  name?: string
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  /** Adds a first item that clears the value, e.g. "All projects" or "— None —". */
  clearLabel?: string
  /** Show the type-to-search box. Defaults to on for lists longer than 7. */
  searchable?: boolean
  contentClassName?: string
}

/**
 * Searchable select: Popover + Command (shadcn "combobox" pattern).
 * Drop-in for a native <select>: same `name`/value semantics, "" means none.
 */
function Combobox({
  options,
  value,
  defaultValue = "",
  onValueChange,
  name,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  clearLabel,
  searchable,
  disabled,
  className,
  contentClassName,
  ...props
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [inner, setInner] = React.useState(defaultValue)
  const current = value ?? inner
  const selected = options.find((o) => o.value === current)
  const showSearch = searchable ?? options.length > 7

  const groups = React.useMemo(() => {
    const out: { heading?: string; items: ComboboxOption[] }[] = []
    for (const o of options) {
      const last = out[out.length - 1]
      if (last && last.heading === o.group) last.items.push(o)
      else out.push({ heading: o.group, items: [o] })
    }
    return out
  }, [options])

  function choose(v: string) {
    if (value === undefined) setInner(v)
    onValueChange?.(v)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between border-input bg-card px-3 font-normal shadow-xs aria-invalid:border-destructive",
            !selected && "text-muted-foreground",
            className
          )}
          {...props}
        >
          <span className="truncate">
            {selected ? (
              <>
                {selected.label}
                {selected.hint && (
                  <span className="ml-1.5 text-muted-foreground">
                    {selected.hint}
                  </span>
                )}
              </>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {name && (
        <input type="hidden" name={name} value={current} disabled={disabled} />
      )}
      <PopoverContent
        align="start"
        className={cn(
          "w-(--radix-popover-trigger-width) min-w-56 p-0",
          contentClassName
        )}
      >
        <Command>
          {showSearch && <CommandInput placeholder={searchPlaceholder} />}
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {clearLabel && (
              <>
                <CommandGroup>
                  <CommandItem value={`__clear__ ${clearLabel}`} onSelect={() => choose("")}>
                    <CheckIcon
                      className={cn("size-4", current === "" ? "opacity-100" : "opacity-0")}
                    />
                    <span className="text-muted-foreground">{clearLabel}</span>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            {groups.map((g, gi) => (
              <CommandGroup key={g.heading ?? `g${gi}`} heading={g.heading}>
                {g.items.map((o) => (
                  <CommandItem
                    key={o.value}
                    // cmdk filters on value + keywords; value must be unique
                    value={`${o.label} ${o.hint ?? ""} #${o.value}`}
                    keywords={o.keywords}
                    disabled={o.disabled}
                    onSelect={() => choose(o.value)}
                  >
                    <CheckIcon
                      className={cn("size-4", current === o.value ? "opacity-100" : "opacity-0")}
                    />
                    <span className="truncate">{o.label}</span>
                    {o.hint && (
                      <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">
                        {o.hint}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { Combobox }
