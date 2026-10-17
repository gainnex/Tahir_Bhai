"use client";

import type * as React from "react";
import Link from "next/link";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RowAction =
  | { label: string; icon?: LucideIcon; href: string; destructive?: boolean }
  | { label: string; icon?: LucideIcon; onSelect: () => void; destructive?: boolean; disabled?: boolean }
  | "separator";

/** "⋯" menu for a table row (View / Edit / Approve / Delete …). */
export function RowActions({ label, actions }: { label: React.ReactNode; actions: RowAction[] }) {
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="data-[state=open]:bg-muted" aria-label="Row actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="truncate font-mono text-xs text-muted-foreground">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {actions.map((a, i) => {
          if (a === "separator") return <DropdownMenuSeparator key={i} />;
          const Icon = a.icon;
          const variant = a.destructive ? "destructive" : "default";
          if ("href" in a)
            return (
              <DropdownMenuItem key={a.label} variant={variant} asChild>
                <Link href={a.href}>
                  {Icon && <Icon />} {a.label}
                </Link>
              </DropdownMenuItem>
            );
          return (
            <DropdownMenuItem key={a.label} variant={variant} disabled={a.disabled} onSelect={a.onSelect}>
              {Icon && <Icon />} {a.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
