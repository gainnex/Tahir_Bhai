import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { errorMessage } from "@/lib/errors";
import { formDataToObject, zodFieldErrors, type ActionState } from "@/lib/forms";

type Parsed<S extends z.ZodType> = { ok: true; data: z.output<S> } | { ok: false; state: ActionState };

/** Validate FormData against a zod schema (the same schema the client form uses). */
export function parseForm<S extends z.ZodType>(schema: S, formData: FormData): Parsed<S> {
  const result = schema.safeParse(formDataToObject(formData));
  if (result.success) return { ok: true, data: result.data };
  const fieldErrors = zodFieldErrors(result.error);
  return {
    ok: false,
    state: { error: fieldErrors._form ?? "Please correct the highlighted fields.", fieldErrors },
  };
}

/**
 * Run a server action body and convert thrown errors into a form-friendly state.
 * redirect()/notFound()/forbidden() are re-thrown so Next.js can handle them.
 */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    return { error: errorMessage(e) };
  }
}
