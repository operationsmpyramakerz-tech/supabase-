/**
 * History is an administrator tool, not a password/token viewer.
 * Older audit rows may contain unsanitized request JSON; redact those fields
 * at the API boundary without changing persisted records.
 */
const PRIVATE_KEY = /(?:password|passwd|passphrase|secret|api[-_]?key|token|bearer|authorization|cookie|private[-_]?key|otp|pin[-_]?code|csrf|client[-_]?secret)/i;
const BEARER = /\bBearer\s+[A-Za-z0-9_.~+\/-]{10,}/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g;

function redactText(value) {
  return String(value).slice(0, 3000)
    .replace(BEARER, "Bearer [REDACTED]")
    .replace(JWT, "[REDACTED JWT]");
}

export function redactHistoryPayload(input, depth = 0, seen = new WeakSet()) {
  if (input === null || input === undefined) return input;
  if (typeof input === "string") return redactText(input);
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (typeof input !== "object") return "[UNSUPPORTED]";
  if (depth > 5) return "[TRUNCATED]";
  if (seen.has(input)) return "[CIRCULAR]";
  seen.add(input);
  let output;
  if (Array.isArray(input)) {
    output = input.slice(0, 30).map((entry) => redactHistoryPayload(entry, depth + 1, seen));
    if (input.length > 30) output.push(`[${input.length - 30} more items omitted]`);
  } else {
    output = {};
    const entries = Object.entries(input);
    for (const [key, value] of entries.slice(0, 100)) {
      output[key] = PRIVATE_KEY.test(key) ? "[REDACTED]" : redactHistoryPayload(value, depth + 1, seen);
    }
    if (entries.length > 100) output.__truncated__ = `${entries.length - 100} more fields omitted`;
  }
  seen.delete(input);
  return output;
}
