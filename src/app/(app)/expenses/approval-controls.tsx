"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, CheckCircle2, CircleAlert, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ActionForm, TextareaField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionState } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { rejectSchema } from "@/lib/validation/expenses";

type Props = {
  approve: () => Promise<ActionState>;
  reject: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  splitLines?: number; // > 1 when this is part of a split bill
  compact?: boolean; // inline in a list row
  /** Shown in the reject dialog, e.g. the expense number. */
  label?: string;
};

/** Approve / Reject (reason required, in a dialog) for one pending expense or split bill. */
export function ApprovalControls({ approve, reject, splitLines = 1, compact, label }: Props) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState>({});
  const [open, setOpen] = useState(false);
  const r = useActionForm<{ reason: string }>(reject, rejectSchema, { defaultValues: { reason: "" } });
  const rejected = r.state.ok;
  const done = result.ok || rejected;
  const size = compact ? "sm" : "default";

  useEffect(() => {
    if (r.state.ok && r.state.message) toast.warning(r.state.message);
  }, [r.state]);

  if (done) {
    return (
      <Alert variant={result.ok ? "success" : "warning"} className={cn(compact && "px-3 py-2 text-xs")}>
        {result.ok ? <CheckCircle2 /> : <XCircle />}
        <AlertDescription className="text-inherit">{result.message ?? r.state.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      {result.error && (
        <Alert variant="destructive" className={cn(compact && "px-3 py-2 text-xs")}>
          <CircleAlert />
          <AlertDescription className="text-inherit">{result.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="success"
          size={size}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await approve();
              setResult(res);
              if (res.ok && res.message) toast.success(res.message);
            })
          }
        >
          <Check /> {pending ? "Approving…" : splitLines > 1 ? `Approve bill (${splitLines} lines)` : "Approve"}
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size={size} disabled={pending} className="hover:border-rose-200 hover:text-rose-700">
              <X /> Reject
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject {label ?? "expense"}</DialogTitle>
              <DialogDescription>
                {splitLines > 1
                  ? `This rejects all ${splitLines} lines of the split bill. `
                  : ""}
                The person who entered it will see your reason.
              </DialogDescription>
            </DialogHeader>
            <ActionForm f={r} className="space-y-4">
              <TextareaField name="reason" label="Reason for rejection" required rows={3} autoFocus />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" variant="destructive" disabled={r.pending}>
                  {r.pending ? "Rejecting…" : "Reject"}
                </Button>
              </DialogFooter>
            </ActionForm>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
