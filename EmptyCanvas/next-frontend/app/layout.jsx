import Script from "next/script";
import { cookies } from "next/headers";
import "./globals.css";
import "./classic-parity.css";
import "./system-ui.css";

const COVER_URL_COOKIE = "ops_ui_cover_url_v1";

function readCoverUrlFromCookie(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch {}
  decoded = String(decoded || "").trim();
  if (!decoded || decoded.length > 3200) return "";

  // Cover photos are stored as normal public HTTP(S) URLs.  Keep the server
  // seed deliberately narrow so a malformed client cookie can never become
  // arbitrary CSS in the root document.
  try {
    const parsed = new URL(decoded);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function coverCssValue(url) {
  return url ? `url(${JSON.stringify(url)})` : undefined;
}

export const metadata = {
  title: "Operations Hub — Next.js Pilot",
  description: "Incremental Next.js frontend for Operations Hub.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export default async function RootLayout({ children }) {
  const cookieStore = await cookies();
  const coverUrl = readCoverUrlFromCookie(cookieStore.get(COVER_URL_COOKIE)?.value);
  const coverStyle = coverUrl ? { "--ops-system-cover-image": coverCssValue(coverUrl) } : undefined;

  return (
    <html
      lang="en"
      className={coverUrl ? "ops-has-persistent-cover" : undefined}
      style={coverStyle}
      suppressHydrationWarning
    >
      <body>
        {children}
        <Script src="/pwa-register.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
