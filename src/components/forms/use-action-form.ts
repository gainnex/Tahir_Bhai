"use client";

import { startTransition, useActionState, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type DefaultValues, type FieldValues, type Path, type Resolver } from "react-hook-form";
import type { z } from "zod";
import type { ActionState } from "@/lib/forms";

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * react-hook-form wired to a server action.
 *  - Field state + instant validation come from RHF with the same zod schema the server uses.
 *    Form values mirror the HTML form (strings, "" for empty), so the schema sees what it
 *    would see from FormData.
 *  - On a valid submit the payload is built with `new FormData(form)`: every named input,
 *    hidden Combobox/DatePicker inputs and file inputs, exactly as before the migration.
 *  - `shouldUnregister` drops fields that are not rendered (e.g. cheque no. for cash), which is
 *    how a native form behaves.
 *  - Server field errors are pushed back into RHF so <FormMessage> shows them in place.
 *
 * Usage:
 *   const f = useActionForm(action, schema, { defaultValues });
 *   <ActionForm f={f}> <TextField name="name" label="Name" /> … </ActionForm>
 */
export function useActionForm<T extends FieldValues>(
  action: ServerAction,
  schema?: z.ZodType,
  opts: {
    defaultValues?: DefaultValues<T>;
    resetOnSuccess?: boolean;
    /** Async step before sending, e.g. compressing photos. */
    prepare?: (fd: FormData) => Promise<FormData>;
  } = {},
) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(action, {});
  const [clientInvalid, setClientInvalid] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const bindForm = useCallback((el: HTMLFormElement | null) => {
    formRef.current = el;
  }, []);

  // The schema may change between renders (e.g. "Split this bill" switches to the split
  // schema), so the resolver reads the latest one at validation time.
  const schemaRef = useRef(schema);
  useEffect(() => {
    schemaRef.current = schema;
  }, [schema]);
  const resolver: Resolver<T> = (values, context, options) =>
    schemaRef.current
      ? (zodResolver(schemaRef.current as never) as unknown as Resolver<T>)(values, context, options)
      : { values, errors: {} };

  const form = useForm<T>({
    resolver,
    defaultValues: opts.defaultValues,
    shouldUnregister: true,
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const { setError, reset } = form;
  const { resetOnSuccess } = opts;
  useEffect(() => {
    for (const [key, message] of Object.entries(state.fieldErrors ?? {})) {
      if (key !== "_form") setError(key as Path<T>, { type: "server", message });
    }
    if (resetOnSuccess && state.ok) {
      reset();
      formRef.current?.reset();
    }
  }, [state, setError, reset, resetOnSuccess]);

  function send(fd: FormData) {
    if (opts.prepare) {
      setPreparing(true);
      opts.prepare(fd).then((prepared) => {
        setPreparing(false);
        startTransition(() => dispatch(prepared));
      });
      return;
    }
    startTransition(() => dispatch(fd));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    const el = e.currentTarget;
    void form.handleSubmit(
      () => {
        setClientInvalid(false);
        send(new FormData(el));
      },
      () => setClientInvalid(true),
    )(e);
  }

  const formError = clientInvalid ? "Please correct the highlighted fields." : state.error;
  return {
    form,
    /** Callback ref for the <form> element (used to reset it after success). */
    bindForm,
    state,
    onSubmit,
    pending: pending || preparing,
    formError,
    success: !clientInvalid && state.ok ? state.message : undefined,
  };
}

export type ActionFormApi<T extends FieldValues> = ReturnType<typeof useActionForm<T>>;
