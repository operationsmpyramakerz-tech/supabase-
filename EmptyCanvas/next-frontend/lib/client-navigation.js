"use client";

export const APP_NAVIGATION_EVENT = "ops:client-navigate";

function toUrl(target) {
  if (typeof window === "undefined") return null;
  const raw = String(target || "").trim();
  if (!raw) return null;
  try {
    return new URL(raw, window.location.href);
  } catch {
    return null;
  }
}

function isNextAppUrl(url) {
  if (!url || typeof window === "undefined") return false;
  if (url.origin !== window.location.origin) return false;
  return url.pathname === "/next" || url.pathname.startsWith("/next/");
}

/**
 * Navigate inside the migrated Next.js app without forcing a document reload.
 *
 * Internal /next routes are handed to the root InternalNavigationBridge so the
 * persistent shell, prefetched code and client state stay alive. External,
 * legacy and download URLs deliberately keep normal browser navigation.
 */
export function navigateWithinApp(target, { replace = false } = {}) {
  if (typeof window === "undefined") return false;

  const url = toUrl(target);
  if (!url) return false;

  if (isNextAppUrl(url)) {
    const event = new CustomEvent(APP_NAVIGATION_EVENT, {
      cancelable: true,
      detail: {
        target: `${url.pathname}${url.search}${url.hash}`,
        replace: Boolean(replace),
      },
    });

    // InternalNavigationBridge calls preventDefault() when it accepts the
    // navigation. If it is not mounted for any reason, fall through to native
    // navigation instead of leaving a button with no effect.
    const notCancelled = window.dispatchEvent(event);
    if (!notCancelled) return true;
  }

  if (replace) window.location.replace(url.href);
  else window.location.href = url.href;
  return false;
}
