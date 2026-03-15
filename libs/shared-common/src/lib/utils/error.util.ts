export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isErrorWithStatus(
  error: unknown,
): error is Error & { status?: number } {
  return error instanceof Error;
}

