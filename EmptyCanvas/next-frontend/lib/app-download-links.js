import "server-only";

function cleanDownloadUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  const placeholders = ["your-android-download-link", "your-windows-download-link", "your-download-link", "your-app-link", "yourdomain.com", "example.com", "https://your-", "http://your-"];
  if (placeholders.some((part) => lower.includes(part))) return "";
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return raw;
  return "";
}

export function buildAppDownloadLinks(origin = "") {
  const cleanOrigin = String(origin || "").trim().replace(/\/+$/, "");
  const androidUrl = cleanDownloadUrl(process.env.ANDROID_APP_DOWNLOAD_URL || process.env.APP_ANDROID_URL || process.env.APK_DOWNLOAD_URL || "");
  const windowsUrl = cleanDownloadUrl(process.env.WINDOWS_APP_DOWNLOAD_URL || process.env.APP_WINDOWS_URL || process.env.WINDOWS_SETUP_URL || "");
  const absolute = (path) => cleanOrigin ? `${cleanOrigin}${path}` : path;
  return {
    androidUrl,
    windowsUrl,
    pwaUrl: absolute("/next/pwa-start"),
    manifestUrl: absolute("/manifest.webmanifest"),
    pwaStartUrl: absolute("/next/pwa-start"),
    installPageUrl: absolute("/next/app-install"),
    installMode: "pwa",
    source: "next-direct",
  };
}
