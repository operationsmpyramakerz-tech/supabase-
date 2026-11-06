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

  // The PWA can expose a first unstyled frame before the route CSS has been
  // applied. Cover that *briefly*, but never couple the release to Home data,
  // full window.load (images can stall it), or a successful React hydration.
  // A CSS-only expiry is essential: a stale/offline JS chunk must not trap the
  // user behind the company logo forever.
  const coldStartCss = `
    html.ops-cold-start-pending:not([data-ops-cold-start-released]):not(.ops-auth-route-pending) body::before,
    html.ops-cold-start-pending:not([data-ops-cold-start-released]):not(.ops-auth-route-pending) body::after {
      content:"" !important;
      display:block !important;
      position:fixed !important;
      pointer-events:all;
      opacity:1;
      visibility:visible;
      animation:ops-cold-cover-expire 0s linear 7s forwards !important;
    }
    html.ops-cold-start-pending:not([data-ops-cold-start-released]):not(.ops-auth-route-pending) body::before {
      inset:0 !important;
      z-index:2147483644 !important;
      background:#fff !important;
      transform:none !important;
    }
    html.ops-cold-start-pending:not([data-ops-cold-start-released]):not(.ops-auth-route-pending) body::after {
      left:50% !important;
      top:50% !important;
      width:112px !important;
      height:112px !important;
      z-index:2147483645 !important;
      background:url(/icons/icon-192.png) center/contain no-repeat !important;
      transform:translate(-50%,-50%) !important;
    }
    @keyframes ops-cold-cover-expire {
      to { opacity:0; visibility:hidden; pointer-events:none; }
    }
  `;
  const coldStartBootstrap = String.raw`(function(){
    var root=document.documentElement;
    var active='ops-cold-start-pending';
    var released='data-ops-cold-start-released';
    var pathname=location.pathname.replace(/\/+$/,'')||'/';
    var closed=false, signalReceived=false, tick=null, deadline=null;
    function finish(){
      if(closed)return;
      closed=true;
      // Mark the release independently of the SSR class. React / streamed
      // HTML may re-apply the original class during hydration.
      root.setAttribute(released,'');
      root.classList.remove(active);
      if(tick!==null)clearTimeout(tick);
      if(deadline!==null)clearTimeout(deadline);
      document.removeEventListener('DOMContentLoaded',check);
      window.removeEventListener('load',check);
      try{delete window.__opsFinishColdStart;}catch(e){}
    }
    if(!pathname.startsWith('/next/')||/^\/next\/(login|pwa-start|pwa-offline|app-install)(\/|$)/.test(pathname)){
      finish();
      return;
    }
    function stylesReady(){
      // CSS is now declared in the server-rendered layout, not a late client
      // component. Wait for the actual route styles before revealing it.
      var required=[
        '/next/css/style.css',
        '/next/css/ui-redesign.css',
        '/next/css/page-canvas-fix.css',
        '/next/css/classic-parity.css'
      ];
      if(/^\/next\/home(\/|$)/.test(pathname)){
        required.push('/next/css/home-performance.css');
        required.push('/next/css/home.css');
        required.push('/next/css/home-dashboard-v2.css');
      }
      var links=document.querySelectorAll('link[rel="stylesheet"]');
      for(var r=0;r<required.length;r++){
        var found=false;
        for(var i=0;i<links.length;i++){
          var link=links[i];
          if((link.getAttribute('href')||'').indexOf(required[r])===-1)continue;
          found=true;
          if(!link.sheet)return false;
        }
        if(!found)return false;
      }
      for(var j=0;j<links.length;j++){
        var candidate=links[j];
        if(!candidate.disabled&&candidate.media!=='not all'&&!candidate.sheet)return false;
      }
      return true;
    }
    function check(){
      if(closed)return;
      var hasShell=Boolean(document.querySelector('.classic-app-shell .next-classic-page-content'));
      // Root classes come from React layout effects. On the very first paint,
      // revealing before those effects run shows nested fallback chrome at
      // the wrong dimensions, even when the stylesheets have loaded.
      var bodyReady=Boolean(document.body&&document.body.classList.contains('persistent-app-shell'));
      var homeReady=!/^\/next\/home(\/|$)/.test(pathname)
        ||Boolean(document.body&&document.body.classList.contains('page-home'));
      if(stylesReady()&&bodyReady&&homeReady&&(signalReceived||hasShell)){
        requestAnimationFrame(function(){requestAnimationFrame(finish);});
      }
    }
    function poll(){
      if(closed)return;
      check();
      if(!closed)tick=setTimeout(poll,125);
    }
    // A real page registers after it commits, but the styled loading route is
    // enough to reveal while data is still pending. Neither path must wait for
    // the window 'load' event or for Home's API calls to finish.
    window.__opsFinishColdStart=function(){signalReceived=true;check();};
    document.addEventListener('DOMContentLoaded',check);
    window.addEventListener('load',check);
    deadline=setTimeout(finish,6500);
    poll();
  })();`;



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
        {/* The Classic shell must have its CSS in the initial HTML head.
            Previously these links came only from client-rendered AppShell,
            allowing the PWA/Hard Refresh to paint the raw shell first. */}
        <link rel="stylesheet" href="/next/css/style.css?v=boot-main51-v1" precedence="erp-shell" />
        <link rel="stylesheet" href="/next/css/ui-redesign.css?v=orders-filter-dot-black-251" precedence="erp-shell" />
        <link rel="stylesheet" href="/next/css/page-canvas-fix.css?v=boot-main51-v1" precedence="erp-shell" />
        <link rel="stylesheet" href="/next/css/classic-parity.css?v=desktop-flyouts-v334" precedence="erp-shell" />
        <link rel="stylesheet" href="/next/css/dark-mode.css?v=theme-v2-white-nav" precedence="erp-theme" />
        <link rel="stylesheet" href="/next/css/desktop-bottom-dock.css?v=desktop-dock-v332" precedence="erp-desktop-dock" />
        <link rel="stylesheet" href="/next/css/desktop-header-and-home-v333.css?v=333" precedence="erp-desktop-dock-v333" />
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
