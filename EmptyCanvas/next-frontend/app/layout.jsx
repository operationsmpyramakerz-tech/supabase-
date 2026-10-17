import Script from "next/script";
import InternalNavigationBridge from "../components/InternalNavigationBridge";
import SystemNotificationIsland from "../components/SystemNotificationIsland";
import PersistentAppShell from "../components/PersistentAppShell";
import { cookies } from "next/headers";
import "./globals.css";
import "./system-ui.css";

const PROFILE_URL_COOKIE = "ops_ui_profile_url_v1";
const THEME_COOKIE = "ops_ui_theme_v1";
const ALLOWED_PAGES_COOKIE = "ops_ui_allowed_pages_v1";


function normalizeTheme(value) {
  return String(value || "").trim().toLowerCase() === "dark" ? "dark" : "light";
}

function readImageUrlFromCookie(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch {}
  decoded = String(decoded || "").trim();
  if (!decoded || decoded.length > 3200) return "";

  // Profile photos are stored as normal public HTTP(S) URLs. Keep the server
  // seed deliberately narrow so a malformed client cookie cannot become CSS.
  try {
    const parsed = new URL(decoded);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function imageCssValue(url) {
  return url ? `url(${JSON.stringify(url)})` : undefined;
}

function readAllowedPagesFromCookie(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
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
  const profileUrl = readImageUrlFromCookie(cookieStore.get(PROFILE_URL_COOKIE)?.value);
  const theme = normalizeTheme(cookieStore.get(THEME_COOKIE)?.value);
  const shellAccount = {
    allowedPages: readAllowedPagesFromCookie(cookieStore.get(ALLOWED_PAGES_COOKIE)?.value),
    photoUrl: profileUrl,
  };
  const rootClasses = [
    profileUrl ? "ops-has-persistent-profile" : "",
    theme === "dark" ? "ops-theme-dark" : "",
  ].filter(Boolean).join(" ");
  const rootStyle = {
    ...(profileUrl ? { "--ops-profile-image": imageCssValue(profileUrl) } : {}),
    colorScheme: theme,
  };
  const themeBootstrap = `(function(){try{var key=${JSON.stringify(THEME_COOKIE)};var fallback=${JSON.stringify(theme)};var apply=function(value){var next=value==='dark'?'dark':'light';var root=document.documentElement;root.dataset.theme=next;root.classList.toggle('ops-theme-dark',next==='dark');root.style.colorScheme=next;var meta=document.getElementById('ops-theme-color');if(meta){meta.setAttribute('content',next==='dark'?'#080b11':'#ffffff');}return next;};var stored=localStorage.getItem(key);apply(stored==='dark'||stored==='light'?stored:fallback);window.addEventListener('storage',function(event){if(event&&event.key===key){apply(event.newValue);}});}catch(e){}})();`;

  // Only for login/logout document navigations: restore the transition cover
  // before the new document can paint its loading UI. Expire stale transitions
  // so an interrupted navigation can never leave an invisible app indefinitely.
  const authTransitionBootstrap = `(function(){try{var key="ops.auth.navigation.v1";var item=JSON.parse(sessionStorage.getItem(key)||"null");var age=item?Date.now()-item.started:Infinity;if(item&&typeof item.started==="number"&&age>=0&&age<20000){document.documentElement.classList.add("ops-auth-route-pending");setTimeout(function(){document.documentElement.classList.remove("ops-auth-route-pending");try{sessionStorage.removeItem(key);}catch(e){}},20000-age);}else{sessionStorage.removeItem(key);}}catch(e){}})();`;
  const authTransitionCss = `html.ops-auth-route-pending body{overflow:hidden!important}html.ops-auth-route-pending body::before{content:""!important;position:fixed!important;inset:0!important;display:block!important;background:#fff!important;z-index:2147483646!important;pointer-events:all!important;opacity:1!important;transform:none!important}html.ops-auth-route-pending body::after{content:""!important;position:fixed!important;top:calc(50% - 22px)!important;left:calc(50% - 22px)!important;width:44px!important;height:44px!important;display:block!important;box-sizing:border-box!important;border:4px solid #f3e6dc!important;border-top-color:#eb6a20!important;border-radius:50%!important;background:none!important;z-index:2147483647!important;pointer-events:all!important;animation:ops-auth-loading-spin .8s linear infinite!important}@keyframes ops-auth-loading-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){html.ops-auth-route-pending body::after{animation-duration:2s!important}}`;

  // An installed PWA's native splash can disappear before Next.js has hydrated
  // the authenticated shell and before route-specific stylesheets are ready.
  // Apply this minimal cover in the *server HTML*, not in a React effect: it
  // prevents the first, unstyled frame (large SVGs / stacked dashboard cards).
  // Release only after the actual page AppShell commits and its CSS has loaded.
  const coldStartCss = `html.ops-cold-start-pending:not(.ops-auth-route-pending) body{overflow:hidden!important}html.ops-cold-start-pending:not(.ops-auth-route-pending) body::before{content:""!important;position:fixed!important;inset:0!important;display:block!important;background:#fff!important;z-index:2147483644!important;pointer-events:all!important;opacity:1!important;transform:none!important}html.ops-cold-start-pending:not(.ops-auth-route-pending) body::after{content:""!important;position:fixed!important;left:50%!important;top:50%!important;width:112px!important;height:112px!important;display:block!important;background:url(/icons/icon-192.png) center/contain no-repeat!important;z-index:2147483645!important;pointer-events:all!important;transform:translate(-50%,-50%)!important;animation:none!important}`;
  const coldStartBootstrap = `(function(){var root=document.documentElement;var active='ops-cold-start-pending';var pathname=location.pathname.replace(/\/+$/,'')||'/';if(!pathname.startsWith('/next/')||/^\/next\/(login|pwa-start|pwa-offline|app-install)(\/|$)/.test(pathname)){root.classList.remove(active);return;}var closed=false;var watchdog=setTimeout(remove,15000);function remove(){if(closed)return;closed=true;clearTimeout(watchdog);root.classList.remove(active);try{delete window.__opsFinishColdStart;}catch(e){}}function ready(){if(closed)return;var links=Array.from(document.querySelectorAll('link[rel="stylesheet"]'));var waits=links.filter(function(link){return !link.disabled&&link.media!=='not all'&&!link.sheet;}).map(function(link){return new Promise(function(resolve){var timeout=setTimeout(resolve,5000);function settled(){clearTimeout(timeout);resolve();}link.addEventListener('load',settled,{once:true});link.addEventListener('error',settled,{once:true});if(link.sheet)settled();});});Promise.all(waits).then(function(){if(closed)return;requestAnimationFrame(function(){requestAnimationFrame(remove);});});}window.__opsFinishColdStart=function(){if(closed)return;if(document.readyState==='complete')ready();else window.addEventListener('load',ready,{once:true});};})();`;



  return (
    <html
      lang="en"
      data-theme={theme}
      className={[rootClasses, "ops-cold-start-pending"].filter(Boolean).join(" ")}
      style={Object.keys(rootStyle).length ? rootStyle : undefined}
      suppressHydrationWarning
    >
      <head>
        <meta name="color-scheme" content="light dark" />
        <meta id="ops-theme-color" name="theme-color" content={theme === "dark" ? "#080b11" : "#ffffff"} />
        <link rel="stylesheet" href="/next/css/dark-mode.css?v=theme-v2-white-nav" precedence="erp-theme" />
        <style dangerouslySetInnerHTML={{ __html: coldStartCss }} />
        <style dangerouslySetInnerHTML={{ __html: authTransitionCss }} />
        <script dangerouslySetInnerHTML={{ __html: coldStartBootstrap }} />
        <script dangerouslySetInnerHTML={{ __html: authTransitionBootstrap }} />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <InternalNavigationBridge />
        <SystemNotificationIsland />
        <PersistentAppShell initialAccount={shellAccount}>
          {children}
        </PersistentAppShell>
        <Script src="/pwa-register.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
