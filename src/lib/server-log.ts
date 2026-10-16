/**
 * Server-side operational logging (Phase 6.2). Server-only: writes to the
 * process streams, never to a response.
 *
 * Two halves, deliberately split: `sanitizeForLog` is pure (unit-tested
 * here, no I/O) and `logServerEvent` is the thin writer with an injectable
 * sink so tests never touch the real streams.
 *
 * Redaction is structural, not a caller convention: any key naming a
 * credential is replaced before serialisation, so a future caller that
 * logs a whole config object cannot leak `VERCEL_TOKEN`, `AUTH_SECRET`,
 * or `DATABASE_URL` into the platform logs. Tenant *content* (menu text,
 * contact details) must never be passed as context in the first place —
 * log ids, slugs, and outcome flags, not rows — and the breadth/length
 * caps keep an accidental large payload from flooding the log.
 */

export type LogLevel = "info" | "warn" | "error";

/** Key names that always redact, matched case-insensitively. */
const SENSITIVE_KEY =
  /token|secret|password|passwd|private[_-]?key|api[_-]?key|database[_-]?url|connection[_-]?string|auth[_-]?secret|authorization|cookie|set-cookie|session/i;

/** Caps so one event cannot flood the log. */
const MAX_DEPTH = 4;
const MAX_KEYS = 50;
const MAX_ARRAY = 20;
const MAX_STRING = 1000;

const REDACTED = "[redacted]";
const TRUNCATED = "…[truncated]";
const CIRCULAR = "[circular]";
const TOO_DEEP = "[too deep]";

/**
 * Deep-copy `value` for logging: sensitive keys redacted, strings
 * truncated, breadth and depth capped, circular references cut. Primitives
 * pass through; functions and symbols become their type name.
 */
export function sanitizeForLog(value: unknown, depth: number = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + TRUNCATED : value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value;
  }
  if (typeof value === "function" || typeof value === "symbol") {
    return `[${typeof value}]`;
  }
  if (depth >= MAX_DEPTH) return TOO_DEEP;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((item) => sanitizeForLog(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    const keys = Object.keys(value).slice(0, MAX_KEYS);
    for (const key of keys) {
      if (SENSITIVE_KEY.test(key)) {
        out[key] = REDACTED;
        continue;
      }
      try {
        out[key] = sanitizeForLog((value as Record<string, unknown>)[key], depth + 1);
      } catch {
        out[key] = CIRCULAR;
      }
    }
    return out;
  }
  return `[${typeof value}]`;
}

export interface ServerLogEvent {
  /** Stable machine name, e.g. `domain.attach.failed`. */
  event: string;
  level: LogLevel;
  /** Human sentence for the on-call reader. Never include payloads. */
  message: string;
  /** Small facts: ids, slugs, outcome flags. Never rows or secrets. */
  context?: Record<string, unknown>;
}

/** One JSON line: timestamp, level, event, message, sanitised context. */
export function formatLogEvent(input: ServerLogEvent, now: Date = new Date()): string {
  return JSON.stringify({
    ts: now.toISOString(),
    level: input.level,
    event: input.event,
    message: input.message,
    ...(input.context === undefined ? {} : { context: sanitizeForLog(input.context) }),
  });
}

export interface LogSink {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

function defaultSink(): LogSink {
  return {
    // eslint-disable-next-line no-console
    stdout: (line) => console.log(line),
    // eslint-disable-next-line no-console
    stderr: (line) => console.error(line),
  };
}

/**
 * Write one structured line. `warn`/`error` go to stderr so an operator
 * tailing error output sees failures without the info noise; `info` goes
 * to stdout. Failures of the sink itself are swallowed — logging must
 * never break the request it describes.
 */
export function logServerEvent(
  input: ServerLogEvent,
  deps: { sink?: LogSink; now?: Date } = {}
): void {
  const line = formatLogEvent(input, deps.now);
  const sink = deps.sink ?? defaultSink();
  try {
    if (input.level === "info") sink.stdout(line);
    else sink.stderr(line);
  } catch {
    // Logging is best-effort by design.
  }
}
