// The authentication boundary deliberately uses a full document navigation to
// establish a new server session. Carry a small, short-lived visual cover across
// that reload instead of exposing the next route's temporary loading skeleton.
// No tokens, usernames or account information are stored here.
const TRANSITION_KEY = "ops.auth.navigation.v1";
const COVER_CLASS = "ops-auth-route-pending";
const MAX_AGE_MS = 20000;

export function beginAuthRouteTransition(destination) {
  if (typeof window === "undefined") return;
  try {
    const target = new URL(destination, window.location.href);
    if (target.origin !== window.location.origin) return;
    window.sessionStorage.setItem(TRANSITION_KEY, JSON.stringify({
      started: Date.now(),
      path: target.pathname,
    }));
    document.documentElement.classList.add(COVER_CLASS);
  } catch {
    // Storage can be blocked in private mode. Navigation must still work.
  }
}

export function finishAuthRouteTransition() {
  if (typeof window === "undefined") return;
  let isPending = false;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(TRANSITION_KEY) || "null");
    isPending = Boolean(saved && Number.isFinite(saved.started)
      && Date.now() - saved.started >= 0
      && Date.now() - saved.started < MAX_AGE_MS);
  } catch {}
  if (!isPending && !document.documentElement.classList.contains(COVER_CLASS)) return;

  // React has committed the destination page here. Wait for the browser's next
  // paints so styles are applied before exposing the view to the user.
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    try { window.sessionStorage.removeItem(TRANSITION_KEY); } catch {}
    document.documentElement.classList.remove(COVER_CLASS);
  }));
}
