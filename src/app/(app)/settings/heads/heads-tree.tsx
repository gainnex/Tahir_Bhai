"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, CircleOff, MoreHorizontal, Pencil, Plus, Power } from "lucide-react";
import { toast } from "sonner";
import { ActionForm, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActionState } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { headNameSchema } from "@/lib/validation/settings";
import {
  createHeadAction,
  createSubheadAction,
  moveHeadAction,
  renameHeadAction,
  renameSubheadAction,
  setHeadActiveAction,
  setSubheadActiveAction,
} from "../actions";

type Sub = { id: number; name: string; isActive: boolean; expenseCount: number };
type Head = Sub & { subheads: Sub[] };
type FormActionFn = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/** Name form (add + rename) shown inside a dialog. Calls onDone after a successful save. */
function NameForm({
  action,
  defaultValue,
  placeholder,
  submitLabel,
  onDone,
}: {
  action: FormActionFn;
  defaultValue?: string;
  placeholder?: string;
  submitLabel: string;
  onDone: () => void;
}) {
  const f = useActionForm<{ name: string }>(
    async (prev, fd) => {
      const res = await action(prev, fd);
      if (res.ok) onDone();
      return res;
    },
    headNameSchema,
    { resetOnSuccess: true, defaultValues: { name: defaultValue ?? "" } },
  );
  return (
    <ActionForm f={f} className="space-y-4">
      <TextField name="name" label="Name" required placeholder={placeholder} autoFocus />
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={f.pending}>
          {f.pending ? "Saving…" : submitLabel}
        </Button>
      </DialogFooter>
    </ActionForm>
  );
}

/** Dialog wrapping a NameForm. Content unmounts on close, so each open starts fresh. */
function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  ...form
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  action: FormActionFn;
  defaultValue?: string;
  placeholder?: string;
  submitLabel: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <NameForm {...form} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function AddHeadForm() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Add head
      </Button>
      <NameDialog
        open={open}
        onOpenChange={setOpen}
        title="Add expense head"
        description="Sub-heads can be added to it afterwards."
        action={createHeadAction}
        placeholder="New head name"
        submitLabel="Add head"
      />
    </>
  );
}

/** Runs an enable/disable/move action and reports errors as a toast. */
function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionState>) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
    });
  return [pending, run] as const;
}

function ExpenseCount({ n }: { n: number }) {
  return (
    <span className="ml-2 font-mono text-xs font-normal text-muted-foreground tabular-nums no-underline">
      {n} {n === 1 ? "expense" : "expenses"}
    </span>
  );
}

function SubheadRow({ sub, headActive }: { sub: Sub; headActive: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const [pending, run] = useRun();
  return (
    <li className="flex items-center gap-2 py-2 pl-2 sm:pl-6">
      <span className={cn("flex-1 text-sm", (!sub.isActive || !headActive) && "text-muted-foreground line-through")}>
        {sub.name}
        <ExpenseCount n={sub.expenseCount} />
      </span>
      {!sub.isActive && (
        <Badge variant="danger">
          <CircleOff /> Disabled
        </Badge>
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`Actions for ${sub.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant={sub.isActive ? "destructive" : "default"}
            onSelect={() => run(() => setSubheadActiveAction(sub.id, !sub.isActive))}
          >
            <Power /> {sub.isActive ? "Disable" : "Enable"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename sub-head"
        action={renameSubheadAction.bind(null, sub.id)}
        defaultValue={sub.name}
        submitLabel="Save"
      />
    </li>
  );
}

function HeadCard({ head, first, last }: { head: Head; first: boolean; last: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pending, run] = useRun();

  return (
    <Card className={cn("gap-0 py-0 sm:gap-0 sm:py-0", !head.isActive && "bg-muted/50")}>
      <CardHeader className="flex items-center gap-2 border-b border-border/60 py-3 sm:py-3 [.border-b]:pb-3">
        <div className="flex flex-col">
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={first || pending}
            onClick={() => run(() => moveHeadAction(head.id, "up"))}
            aria-label={`Move ${head.name} up`}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={last || pending}
            onClick={() => run(() => moveHeadAction(head.id, "down"))}
            aria-label={`Move ${head.name} down`}
          >
            <ArrowDown />
          </Button>
        </div>
        <CardTitle className={cn("flex-1", !head.isActive && "text-muted-foreground line-through")}>
          {head.name}
          <ExpenseCount n={head.expenseCount} />
        </CardTitle>
        <CardAction className="flex items-center gap-2 self-center">
          {!head.isActive && (
            <Badge variant="danger">
              <CircleOff /> Disabled
            </Badge>
          )}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`Actions for ${head.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => setRenaming(true)}>
                <Pencil /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAdding(true)}>
                <Plus /> Add sub-head
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={first} onSelect={() => run(() => moveHeadAction(head.id, "up"))}>
                <ArrowUp /> Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={last} onSelect={() => run(() => moveHeadAction(head.id, "down"))}>
                <ArrowDown /> Move down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant={head.isActive ? "destructive" : "default"}
                onSelect={() => run(() => setHeadActiveAction(head.id, !head.isActive))}
              >
                <Power /> {head.isActive ? "Disable" : "Enable"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="px-3 py-1 sm:px-4">
        <ul className="divide-y divide-border/60">
          {head.subheads.map((s) => (
            <SubheadRow key={s.id} sub={s} headActive={head.isActive} />
          ))}
          <li className="py-2 pl-2 sm:pl-6">
            <Button size="sm" variant="link" className="h-auto px-0" onClick={() => setAdding(true)}>
              <Plus /> Add sub-head
            </Button>
          </li>
        </ul>
      </CardContent>
      <NameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename head"
        action={renameHeadAction.bind(null, head.id)}
        defaultValue={head.name}
        submitLabel="Save"
      />
      <NameDialog
        open={adding}
        onOpenChange={setAdding}
        title={`Add sub-head to ${head.name}`}
        action={createSubheadAction.bind(null, head.id)}
        placeholder="New sub-head name"
        submitLabel="Add sub-head"
      />
    </Card>
  );
}

export function HeadTree({ heads }: { heads: Head[] }) {
  if (heads.length === 0) return <Notice>No expense heads yet. Add one to get started.</Notice>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {heads.map((h, i) => (
        <HeadCard key={h.id} head={h} first={i === 0} last={i === heads.length - 1} />
      ))}
    </div>
  );
}
