// Only the Database > Orders table accepts this server-side search.
// Use a numeric equality filter so all rows belonging to an order are returned,
// regardless of which page they were originally on.
export function parseBackupOrderNumberSearch(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { active: false, valid: true, number: "" };

  const match = /^(?:ORD\s*[-#:]*\s*)?(\d+)$/i.exec(raw);
  if (!match) return { active: true, valid: false, number: "" };

  const number = match[1].replace(/^0+(?=\d)/, "");
  // Avoid passing invalid or out-of-range integer literals to PostgREST.
  if (number.length > 15 || !Number.isSafeInteger(Number(number))) {
    return { active: true, valid: false, number: "" };
  }
  return { active: true, valid: true, number };
}
