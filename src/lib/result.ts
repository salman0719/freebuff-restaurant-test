/**
 * Stable service-boundary contract (Phase 1.2).
 *
 * Every service and server action returns a `ServiceResult<T>`: either
 * `{ ok: true, data }` or `{ ok: false, error }`. Callers narrow on `ok`
 * instead of catching thrown exceptions for expected failures (not found,
 * forbidden, invalid input). Unexpected crashes still throw — `INTERNAL`
 * exists for caught failures converted at the boundary, not as an excuse
 * to swallow errors.
 *
 * Deliberately HTTP-free: route handlers map `code` to status codes later
 * (Phase 3/4). Nothing here imports Zod or Drizzle, so both server and
 * client code can use these shapes freely.
 */
export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "CONFLICT",
  "FORBIDDEN",
  "UNAUTHORIZED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ServiceError {
  code: ErrorCode;
  message: string;
  /** Field-keyed messages for `VALIDATION_FAILED` (see `validationFields`). */
  fields?: Record<string, string[]>;
}

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: ServiceError };

/** Success wrapper. */
export function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

/** Failure wrapper. */
export function err<T>(
  code: ErrorCode,
  message: string,
  fields?: Record<string, string[]>
): ServiceResult<T> {
  return fields === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, fields } };
}

/** Narrowing helper for early returns: `if (isErr(r)) return r;`. */
export function isErr<T>(
  result: ServiceResult<T>
): result is Extract<ServiceResult<T>, { ok: false }> {
  return !result.ok;
}
