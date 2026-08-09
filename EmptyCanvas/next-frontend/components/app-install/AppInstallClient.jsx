"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function text(value) {
  return String(value ?? "").trim();
}

function isUsableUrl(value) {
  const url = text(value);
  return /^https?:\/\//i.test(url) || url.startsWith("/");
}

function platformInfo() {
  if (typeof navigator === "undefined") return { label: "Browser", key: "browser" };
  const ua = String(navigator.userAgent || "");
  if (/Android/i.test(ua)) return { label: "Android", key: "android" };
  if (/iPhone|iPad|iPod/i.test(ua)) return { label: "iPhone / iPad", key: "ios" };
  if (/Windows/i.test(ua)) return { label: "Windows", key: "windows" };
  if (/Macintosh|Mac OS X/i.test(ua)) return { label: "macOS", key: "mac" };
  return { label: "Browser", key: "browser" };
}

function standaloneMode() {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true || document.referrer.startsWith("android-app://");
  } catch {
    return false;
  }
}

function InstallSteps({ platform }) {
  if (platform === "android") {
    return (
      <ol>
        <li>Open Operations Hub in Chrome on Android.</li>
        <li>Keep <strong>Desktop site</strong> turned off.</li>
        <li>Use the Install button here. If Chrome does not expose the prompt, open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
      </ol>
    );
  }
  if (platform === "ios") {
    return (
      <ol>
        <li>Open Operations Hub in Safari.</li>
        <li>Tap the Share button.</li>
        <li>Choose <strong>Add to Home Screen</strong>, then confirm Add.</li>
      </ol>
    );
  }
  return (
    <ol>
      <li>Open Operations Hub in Chrome or Microsoft Edge.</li>
      <li>Use the Install button here, or click the install icon in the address bar.</li>
      <li>If needed, open the browser menu and choose <strong>Apps → Install this site as an app</strong>.</li>
    </ol>
  );
}

export default function AppInstallClient({ initialLinks = {} }) {
  const [status, setStatus] = useState({
    standalone: false,
    promptReady: false,
    serviceWorkerSupported: false,
    serviceWorkerReady: false,
    controlled: false,
    online: true,
  });
  const [manifest, setManifest] = useState(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const promptRef = useRef(null);
  const platform = useMemo(() => platformInfo(), []);

  const links = useMemo(() => ({
    androidUrl: isUsableUrl(initialLinks?.androidUrl) ? initialLinks.androidUrl : "",
    windowsUrl: isUsableUrl(initialLinks?.windowsUrl) ? initialLinks.windowsUrl : "",
    pwaStartUrl: isUsableUrl(initialLinks?.pwaStartUrl) ? initialLinks.pwaStartUrl : "/next/pwa-start",
    manifestUrl: isUsableUrl(initialLinks?.manifestUrl) ? initialLinks.manifestUrl : "/manifest.webmanifest",
  }), [initialLinks]);

  function syncStatus() {
    if (typeof window === "undefined") return;
    const helper = window.OpsPWAInstall;
    if (helper?.deferredPrompt) promptRef.current = helper.deferredPrompt;
    setStatus((current) => ({
      ...current,
      standalone: standaloneMode(),
      promptReady: !!(promptRef.current || helper?.deferredPrompt),
      serviceWorkerSupported: "serviceWorker" in navigator,
      serviceWorkerReady: !!helper?.serviceWorkerReady || current.serviceWorkerReady,
      controlled: !!navigator.serviceWorker?.controller,
      online: navigator.onLine !== false,
    }));
  }

  useEffect(() => {
    let mounted = true;
    const beforeInstall = (event) => {
      try { event.preventDefault(); } catch {}
      promptRef.current = event;
      if (window.OpsPWAInstall) window.OpsPWAInstall.deferredPrompt = event;
      syncStatus();
    };
    const installed = () => {
      promptRef.current = null;
      if (mounted) {
        setNotice({ type: "success", text: "Operations Hub was installed successfully on this device." });
        syncStatus();
      }
    };
    const connection = () => syncStatus();
    const controllerChange = () => syncStatus();

    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    window.addEventListener("ops:pwa-install-available", syncStatus);
    window.addEventListener("ops:pwa-installed", installed);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    navigator.serviceWorker?.addEventListener?.("controllerchange", controllerChange);

    (async () => {
      syncStatus();
      try {
        if ("serviceWorker" in navigator) {
          let registration = await navigator.serviceWorker.getRegistration("/");
          if (!registration) registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
          await navigator.serviceWorker.ready;
          if (mounted) setStatus((current) => ({ ...current, serviceWorkerSupported: true, serviceWorkerReady: true, controlled: !!navigator.serviceWorker.controller }));
          try { registration.update(); } catch {}
        }
      } catch {
        if (mounted) setStatus((current) => ({ ...current, serviceWorkerReady: false }));
      }

      try {
        const response = await fetch("/manifest.webmanifest", { cache: "no-store" });
        const data = response.ok ? await response.json() : null;
        if (mounted && data) setManifest(data);
      } catch {}
      syncStatus();
    })();

    return () => {
      mounted = false;
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("ops:pwa-install-available", syncStatus);
      window.removeEventListener("ops:pwa-installed", installed);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      navigator.serviceWorker?.removeEventListener?.("controllerchange", controllerChange);
    };
  }, []);

  async function install() {
    if (status.standalone) {
      setNotice({ type: "success", text: "This device is already running Operations Hub in installed mode." });
      return;
    }

    const deferredPrompt = promptRef.current || window.OpsPWAInstall?.deferredPrompt;
    if (!deferredPrompt) {
      setNotice({ type: "warning", text: platform.key === "ios" ? "Safari installs PWAs through Add to Home Screen." : "The browser install prompt is not available yet. Use the manual browser steps shown below." });
      return;
    }

    setBusy("install");
    setNotice(null);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice.catch(() => null);
      const outcome = text(choice?.outcome);
      promptRef.current = null;
      if (window.OpsPWAInstall) {
        window.OpsPWAInstall.deferredPrompt = null;
        window.OpsPWAInstall.lastOutcome = outcome || null;
      }
      setNotice(outcome === "accepted"
        ? { type: "success", text: "Install request accepted. The browser will finish adding Operations Hub to this device." }
        : { type: "warning", text: "The install prompt was dismissed. You can retry or use the browser's manual install option." });
      syncStatus();
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "The browser could not open the install prompt." });
    } finally {
      setBusy("");
    }
  }

  async function refreshWorker() {
    setBusy("worker");
    setNotice(null);
    try {
      if (!("serviceWorker" in navigator)) throw new Error("This browser does not support service workers.");
      let registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration) registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
      await registration.update();
      await navigator.serviceWorker.ready;
      setStatus((current) => ({ ...current, serviceWorkerReady: true, controlled: !!navigator.serviceWorker.controller }));
      setNotice({ type: "success", text: "The Operations Hub app shell checked for the latest service worker successfully." });
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "The service worker could not be refreshed." });
    } finally {
      setBusy("");
    }
  }

  async function copyLink() {
    try {
      const url = new URL("/next/pwa-start", window.location.origin).toString();
      await navigator.clipboard.writeText(url);
      setNotice({ type: "success", text: "App launch link copied to the clipboard." });
    } catch {
      setNotice({ type: "warning", text: "The browser did not allow clipboard access." });
    }
  }

  return (
    <section className="next-app-install-page">
      <article className="next-app-install-hero">
        <div className="next-app-install-hero__copy">
          <span>OPERATIONS HUB APP</span>
          <h2>Use the ERP like an installed application</h2>
          <p>Install the same live Operations Hub website as a Progressive Web App. It keeps the normal server, Supabase, permissions and session flow while giving you a dedicated app window on supported devices.</p>
          <div className="next-app-install-hero__actions">
            <button type="button" onClick={install} disabled={busy === "install"}>{busy === "install" ? "Opening install…" : status.standalone ? "App already installed" : "Install Operations Hub"}</button>
            <a href="/next/pwa-start">Open app launcher</a>
            <button type="button" className="is-secondary" onClick={copyLink}>Copy launch link</button>
          </div>
        </div>
        <div className="next-app-install-device">
          <img src="/icons/icon-192.png" alt="Operations Hub app icon" />
          <strong>{manifest?.short_name || "Operations"}</strong>
          <span>{platform.label}</span>
          <em className={status.standalone ? "is-good" : status.promptReady ? "is-ready" : ""}>{status.standalone ? "Installed mode" : status.promptReady ? "Install ready" : "Browser mode"}</em>
        </div>
      </article>

      {notice ? <div className={`next-app-install-notice is-${notice.type}`}>{notice.text}</div> : null}

      <div className="next-app-install-status-grid">
        <article><span>DEVICE</span><strong>{platform.label}</strong><p>Detected from the current browser session.</p></article>
        <article><span>INSTALL STATUS</span><strong>{status.standalone ? "Installed" : status.promptReady ? "Ready" : "Manual"}</strong><p>{status.standalone ? "Running as an installed PWA." : status.promptReady ? "The browser install prompt is available." : "Use the browser menu if no prompt appears."}</p></article>
        <article><span>SERVICE WORKER</span><strong>{status.serviceWorkerReady ? "Ready" : status.serviceWorkerSupported ? "Preparing" : "Unsupported"}</strong><p>{status.controlled ? "This page is controlled by the app service worker." : "The browser may need one refresh after first registration."}</p></article>
        <article><span>CONNECTION</span><strong>{status.online ? "Online" : "Offline"}</strong><p>{status.online ? "Live ERP data is available." : "The offline shell will appear until connectivity returns."}</p></article>
      </div>

      <div className="next-app-install-layout">
        <article className="next-app-install-panel">
          <header><div><span>INSTALLATION</span><h3>Recommended PWA setup</h3></div><button type="button" onClick={refreshWorker} disabled={busy === "worker"}>{busy === "worker" ? "Checking…" : "Refresh app shell"}</button></header>
          <InstallSteps platform={platform.key} />
          <div className="next-app-install-tech">
            <div><small>Manifest</small><strong>{manifest?.name || "Operations Hub"}</strong><span>{manifest?.start_url || "/next/pwa-start"}</span></div>
            <div><small>Display mode</small><strong>{manifest?.display || "standalone"}</strong><span>Runs in its own app window when installed.</span></div>
            <div><small>Offline fallback</small><strong>Enabled</strong><span>The service worker keeps a lightweight offline screen available.</span></div>
          </div>
        </article>

        <aside className="next-app-install-panel next-app-install-downloads">
          <header><div><span>OPTIONAL DOWNLOADS</span><h3>Configured native packages</h3></div></header>
          <p>If an Android APK or Windows installer is configured in Vercel, it appears here. The PWA does not require either package.</p>
          {links.androidUrl ? <a href={links.androidUrl} target="_blank" rel="noreferrer"><span>ANDROID</span><div><strong>Android APK</strong><small>Open configured download</small></div><b>↗</b></a> : null}
          {links.windowsUrl ? <a href={links.windowsUrl} target="_blank" rel="noreferrer"><span>WINDOWS</span><div><strong>Windows installer</strong><small>Open configured download</small></div><b>↗</b></a> : null}
          {!links.androidUrl && !links.windowsUrl ? <div className="next-app-install-empty"><strong>No native packages configured</strong><span>The Progressive Web App remains fully available and is the recommended installation method.</span></div> : null}
          <a className="next-app-install-manifest-link" href={links.manifestUrl || "/manifest.webmanifest"} target="_blank" rel="noreferrer"><span>WEB</span><div><strong>Web App Manifest</strong><small>Inspect the active installation manifest</small></div><b>↗</b></a>
        </aside>
      </div>
    </section>
  );
}
