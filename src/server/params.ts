import { forbidden, notFound } from "next/navigation";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

/** Route param -> positive integer id, or a 404. */
export function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return id;
}

/**
 * Await a service call made while rendering a page: NotFoundError -> 404 page,
 * ForbiddenError -> 403 page. Anything else propagates to the error boundary.
 */
export async function pageData<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    if (e instanceof ForbiddenError) forbidden();
    throw e;
  }
}
