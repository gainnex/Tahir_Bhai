"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ActionState } from "@/lib/forms";
import { cn } from "@/lib/utils";

/** Confirm in an AlertDialog, run a delete server action, show its error (success redirects). */
export function DeleteButton({
  action,
  confirmText,
  title = "Are you sure?",
  label = "Delete",
  className,
}: {
  action: () => Promise<ActionState>;
  confirmText: string;
  title?: string;
  label?: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="destructive" disabled={pending}>
            <Trash2 /> {pending ? "Deleting…" : label}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => start(async () => setError((await action()).error))}
            >
              {label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="max-w-sm text-xs text-destructive">{error}</p>}
    </div>
  );
}
