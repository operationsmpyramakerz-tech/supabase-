import Script from "next/script";
import { cookies } from "next/headers";
import "./globals.css";
import "./classic-parity.css";
import "./system-ui.css";

const COVER_URL_COOKIE = "ops_ui_cover_url_v1";
const PROFILE_URL_COOKIE = "ops_ui_profile_url_v1";
const THEME_COOKIE = "ops_ui_theme_v1";


function normalizeTheme(value) {
  return String(value || "").trim().toLowerCase() === "dark" ? "dark" : "light";
}

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
  const profileUrl = readCoverUrlFromCookie(cookieStore.get(PROFILE_URL_COOKIE)?.value);
  const theme = normalizeTheme(cookieStore.get(THEME_COOKIE)?.value);
  const rootClasses = [
    coverUrl ? "ops-has-persistent-cover" : "",
    profileUrl ? "ops-has-persistent-profile" : "",
    theme === "dark" ? "ops-theme-dark" : "",
  ].filter(Boolean).join(" ");
  const rootStyle = {
    ...(coverUrl ? { "--ops-system-cover-image": coverCssValue(coverUrl) } : {}),
    ...(profileUrl ? { "--ops-profile-image": coverCssValue(profileUrl) } : {}),
    colorScheme: theme,
  };
  const themeBootstrap = `(function(){try{var key=${JSON.stringify(THEME_COOKIE)};var fallback=${JSON.stringify(theme)};var apply=function(value){var next=value==='dark'?'dark':'light';var root=document.documentElement;root.dataset.theme=next;root.classList.toggle('ops-theme-dark',next==='dark');root.style.colorScheme=next;var meta=document.getElementById('ops-theme-color');if(meta){meta.setAttribute('content',next==='dark'?'#080b11':'#ffffff');}return next;};var stored=localStorage.getItem(key);apply(stored==='dark'||stored==='light'?stored:fallback);window.addEventListener('storage',function(event){if(event&&event.key===key){apply(event.newValue);}});}catch(e){}})();`;

  return (
    <html
      lang="en"
      data-theme={theme}
      className={rootClasses || undefined}
      style={Object.keys(rootStyle).length ? rootStyle : undefined}
      suppressHydrationWarning
    >
      <head>
        <meta name="color-scheme" content="light dark" />
        <meta id="ops-theme-color" name="theme-color" content={theme === "dark" ? "#080b11" : "#ffffff"} />
        <link rel="stylesheet" href="/next/css/dark-mode.css?v=theme-v1" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        {children}
        <Script src="/pwa-register.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
