"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import type { z } from "zod";
import { formDataToObject, zodFieldErrors, type ActionState, type FieldErrors } from "@/lib/forms";

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Wires a form to a server action:
 *  - validates with the same zod schema on the client before sending (instant feedback),
 *  - keeps typed values on error (submits via onSubmit, so React does not reset the form),
 *  - exposes pending state and field errors from either side.
 *
 * Usage: const f = useFormAction(action, schema); <form onSubmit={f.onSubmit}>…
 */
export function useFormAction(
  action: ServerAction,
  schema?: z.ZodType,
  opts: {
    resetOnSuccess?: boolean;
    /** Async step before sending, e.g. compressing photos. */
    prepare?: (fd: FormData) => Promise<FormData>;
  } = {},
) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(action, {});
  const [clientErrors, setClientErrors] = useState<FieldErrors | null>(null);
  const [preparing, setPreparing] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  // Clear the inputs after a successful save (e.g. "add" forms that stay on the page).
  useEffect(() => {
    if (opts.resetOnSuccess && state.ok) formRef.current?.reset();
  }, [state, opts.resetOnSuccess]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    formRef.current = e.currentTarget;
    const formData = new FormData(e.currentTarget);
    if (schema) {
      const result = schema.safeParse(formDataToObject(formData));
      if (!result.success) {
        setClientErrors(zodFieldErrors(result.error));
        return;
      }
    }
    setClientErrors(null);
    if (opts.prepare) {
      setPreparing(true);
      opts.prepare(formData).then((fd) => {
        setPreparing(false);
        startTransition(() => dispatch(fd));
      });
      return;
    }
    startTransition(() => dispatch(formData));
  }

  const errors: FieldErrors = clientErrors ?? state.fieldErrors ?? {};
  const formError = clientErrors
    ? (clientErrors._form ?? "Please correct the highlighted fields.")
    : state.error;

  return { state, onSubmit, pending: pending || preparing, errors, formError, success: !clientErrors && state.ok ? state.message : undefined };
}
