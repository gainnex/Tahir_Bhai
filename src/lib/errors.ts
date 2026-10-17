// Errors thrown by the service layer. Their message is safe to show to the user.
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Record") {
    super(`${what} not found.`);
    this.name = "NotFoundError";
  }
}

/** Turn any thrown value into a message for the UI without leaking internals. */
export function errorMessage(e: unknown): string {
  if (e instanceof AppError) return e.message;
  console.error(e);
  return "Something went wrong. Please try again.";
}
