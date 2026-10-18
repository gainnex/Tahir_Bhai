import { z } from "zod";
import { dateField, optionalDate, optionalMoney, optionalText, requiredText } from "@/lib/forms";

export const PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: "Active",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
};

/** Checkbox group -> array of ids (FormData gives a string for one, an array for many). */
const idList = z.preprocess(
  (v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.coerce.number().int().positive()),
);

export const projectSchema = z
  .object({
    code: z
      .string({ error: "Code is required" })
      .trim()
      .toUpperCase()
      .min(1, "Code is required")
      .max(20, "Code is too long (max 20 characters)")
      .regex(/^[A-Z0-9][A-Z0-9-]*$/, "Use letters, numbers and dashes only, e.g. PRJ-001"),
    name: requiredText("Name", 150),
    clientName: optionalText(150),
    projectManager: optionalText(150),
    location: optionalText(150),
    startDate: dateField("Start date"),
    endDate: optionalDate,
    status: z.enum(PROJECT_STATUSES, { error: "Select a status" }),
    budget: optionalMoney("Budget"),
    notes: optionalText(2000),
    siteInchargeIds: idList,
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, {
    message: "End date cannot be before the start date",
    path: ["endDate"],
  });
export type ProjectInput = z.output<typeof projectSchema>;
