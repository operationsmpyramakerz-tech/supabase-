/** Only absolute HTTP(S) links may be saved as external team-member media. */
export function isValidExternalMediaUrl(value) {
  const raw = String(value ?? "").trim();
  if (!/^https?:\/\//i.test(raw)) return false;
  try {
    const parsed = new URL(raw);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && !!parsed.hostname;
  } catch {
    return false;
  }
}

/**
 * Resolve the URL and display name without changing the user's URL or query string.
 * Also accept legacy/reversed field entry: URL in Name, label in Link.
 */
export function resolveExternalMediaLink(rawUrl, rawName) {
  let url = String(rawUrl ?? "").trim();
  let name = String(rawName ?? "").trim();
  if (!isValidExternalMediaUrl(url) && isValidExternalMediaUrl(name)) {
    [url, name] = [name, url];
  }
  if (!url) return { ok: false, reason: "missing" };
  if (!isValidExternalMediaUrl(url)) return { ok: false, reason: "invalid" };
  return { ok: true, url, name };
}
