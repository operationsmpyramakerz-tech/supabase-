"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { APP_NAVIGATION_EVENT } from "../lib/client-navigation";

const BASE_PATH = "/next";

function routerHrefFromUrl(url) {
  const pathname = String(url?.pathname || "");
  if (pathname === BASE_PATH) return `/${url.search || ""}${url.hash || ""}`;
  if (!pathname.startsWith(`${BASE_PATH}/`)) return "";
  const stripped = pathname.slice(BASE_PATH.length) || "/";
  return `${stripped}${url.search || ""}${url.hash || ""}`;
}

function eligibleAnchor(target) {
  const element = target instanceof Element ? target : null;
  const anchor = element?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.hasAttribute("download")) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.dataset?.nextNavigation === "off") return null;
  const href = String(anchor.getAttribute("href") || "").trim();
  if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(href)) return null;
  return anchor;
}

function resolveInternalHref(anchor) {
  if (!(anchor instanceof HTMLAnchorElement)) return "";
  let url;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return "";
  }
  if (url.origin !== window.location.origin) return "";
  return routerHrefFromUrl(url);
}

export default function InternalNavigationBridge() {
  const router = useRouter();

  useEffect(() => {
    const prefetched = new Set();

    const prefetchAnchor = (anchor) => {
      const href = resolveInternalHref(anchor);
      if (!href || prefetched.has(href)) return;
      prefetched.add(href);
      try {
        router.prefetch(href);
      } catch {}
    };

    const onPointerOver = (event) => {
      const anchor = eligibleAnchor(event.target);
      if (anchor) prefetchAnchor(anchor);
    };

    const onFocusIn = (event) => {
      const anchor = eligibleAnchor(event.target);
      if (anchor) prefetchAnchor(anchor);
    };

    const onPointerDown = (event) => {
      if (!(event instanceof PointerEvent) || event.button !== 0) return;
      const anchor = eligibleAnchor(event.target);
      if (anchor) prefetchAnchor(anchor);
    };

    const onProgrammaticNavigate = (event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      const rawTarget = String(detail?.target || "").trim();
      if (!rawTarget) return;

      let destination;
      try {
        destination = new URL(rawTarget, window.location.href);
      } catch {
        return;
      }
      if (destination.origin !== window.location.origin) return;

      const href = routerHrefFromUrl(destination);
      if (!href) return;

      event.preventDefault();
      if (detail?.replace) router.replace(href);
      else router.push(href);
    };

    const onClick = (event) => {
      if (!(event instanceof MouseEvent) || event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = eligibleAnchor(event.target);
      if (!anchor) return;

      const href = resolveInternalHref(anchor);
      if (!href) return;

      let destination;
      try {
        destination = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      // Keep native same-document hash navigation intact.
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search &&
        destination.hash
      ) {
        return;
      }

      event.preventDefault();
      router.push(href);
    };

    // Bubble phase is deliberate: feature-specific handlers (sidebar flyouts,
    // downloads, modals, etc.) get first chance to prevent the navigation.
    document.addEventListener("pointerover", onPointerOver, false);
    document.addEventListener("focusin", onFocusIn, false);
    document.addEventListener("pointerdown", onPointerDown, false);
    document.addEventListener("click", onClick, false);
    window.addEventListener(APP_NAVIGATION_EVENT, onProgrammaticNavigate);

    return () => {
      document.removeEventListener("pointerover", onPointerOver, false);
      document.removeEventListener("focusin", onFocusIn, false);
      document.removeEventListener("pointerdown", onPointerDown, false);
      document.removeEventListener("click", onClick, false);
      window.removeEventListener(APP_NAVIGATION_EVENT, onProgrammaticNavigate);
    };
  }, [router]);

  return null;
}
