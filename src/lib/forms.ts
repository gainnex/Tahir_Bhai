import { z } from "zod";

// Shared by client forms and server actions.

export type FieldErrors = Record<string, string>;

/** What every server action returns to its form. */
export type ActionState = {
  ok?: boolean;
  message?: string; // success message
  error?: string; // form-level error
  fieldErrors?: FieldErrors;
};

/** First message per field, keyed by dotted path ("lines.0.amount"). */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * FormData -> plain object. Repeated keys become arrays; File inputs are skipped.
 * Dotted names nest, with numeric parts as array indexes:
 * "lines.0.amount" -> { lines: [{ amount }] } (matches zod error paths).
 */
export function formDataToObject(fd: FormData): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, value] of fd.entries()) {
    if (typeof value !== "string") continue;
    if (key in flat) {
      const prev = flat[key];
      flat[key] = Array.isArray(prev) ? [...prev, value] : [prev, value];
    } else {
      flat[key] = value;
    }
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (!key.includes(".")) {
      out[key] = value;
      continue;
    }
    const parts = key.split(".");
    let node: Record<string, unknown> | unknown[] = out;
    parts.forEach((part, i) => {
      const last = i === parts.length - 1;
      const k: string | number = /^\d+$/.test(part) ? Number(part) : part;
      const container = node as Record<string | number, unknown>;
      if (last) {
        container[k] = value;
      } else {
        if (container[k] === undefined) container[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
        node = container[k] as Record<string, unknown>;
      }
    });
  }
  // Drop holes left by removed rows ("lines.0", "lines.2")
  for (const [key, value] of Object.entries(out)) {
    if (Array.isArray(value)) out[key] = value.filter((v) => v !== undefined);
  }
  return out;
}

// ---- zod field helpers for HTML form values (everything arrives as a string) ----

/** Required trimmed text. */
export const requiredText = (label: string, max = 200) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long (max ${max} characters)`);

/** Optional trimmed text; "" becomes null. */
export const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max, `Too long (max ${max} characters)`)
    .optional()
    .transform((v) => (v ? v : null));

/** Checkbox: "on"/"true" -> true, missing -> false. */
export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** Positive integer id from a <select>. */
export const idField = (label: string) =>
  z.coerce
    .number({ error: `Select a ${label.toLowerCase()}` })
    .int()
    .positive(`Select a ${label.toLowerCase()}`);

export const optionalId = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : Number(v)),
  z.number().int().positive().nullable(),
);

/** "YYYY-MM-DD" from <input type="date">. */
export const dateField = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} is required`)
    .refine((v) => !Number.isNaN(Date.parse(v)), `${label} is not a valid date`);

export const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Not a valid date");

/**
 * Money as a decimal string with at most 2 decimals, e.g. "1250000" or "1250.50".
 * Commas are allowed in input ("1,250,000"). Kept as a string — never a float.
 */
export const moneyString = (label: string, opts: { allowZero?: boolean } = {}) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .refine((v) => v !== "", `${label} is required`)
    .refine((v) => /^\d{1,12}(\.\d{1,2})?$/.test(v), `${label} must be a number with at most 2 decimals`)
    .refine((v) => opts.allowZero || /[1-9]/.test(v), `${label} must be greater than 0`);

export const optionalMoney = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/,/g, "") : null))
    .refine(
      (v) => v === null || /^\d{1,12}(\.\d{1,2})?$/.test(v),
      `${label} must be a number with at most 2 decimals`,
    );
