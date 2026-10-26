// Install links must never be constructed from client-controlled Host or
// X-Forwarded-Host values. A deployment can explicitly opt in to absolute
// links via ERP_PUBLIC_URL; otherwise relative links use the viewer's origin.
export function trustedAppPublicOrigin(configuredUrl = "") {
  const value = String(configuredUrl || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && url.protocol !== "http:")) return "";
    // Do not append the app path to a custom path supplied by accident.
    if (url.pathname !== "/" && url.pathname !== "") return "";
    if (!url.hostname || /[\s\\]/.test(url.hostname)) return "";
    return url.origin;
  } catch { return ""; }
}
