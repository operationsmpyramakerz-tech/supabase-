// Operations Hub PWA Service Worker
// Bump this value whenever we change static assets so old deployments don't stay cached.
const CACHE_NAME = "ops-cache-stocktaking-export-modal-v1";

const PRECACHE_URLS = [
  "/pwa-start",
  "/pwa-start.html",
  "/pwa-offline.html",
  "/manifest.webmanifest",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)));
      await self.clients.claim();
    })()
  );
});

async function networkFirstNavigation(request) {
  try {
    const fresh = await fetch(request);
    return fresh;
  } catch {
    const cachedStart = await caches.match("/pwa-start.html");
    const cachedOffline = await caches.match("/pwa-offline.html");
    return cachedStart || cachedOffline || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // This navigation handler is important for Chrome installability checks.
  // It makes sure the service worker controls the manifest start_url and has
  // a real navigation fallback instead of being only a static-asset cache.
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(networkFirstNavigation(req));
    return;
  }

  const isStatic =
    req.destination === "style" ||
    req.destination === "script" ||
    req.destination === "image" ||
    req.destination === "font" ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/manifest.json";

  if (!isStatic) return;
  event.respondWith(staleWhileRevalidate(req));
});

// -------------------------------
// Push Notifications (Web Push)
// -------------------------------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    try {
      data = { body: event.data ? event.data.text() : "" };
    } catch {
      data = {};
    }
  }

  const title = data.title || "Operations";
  const body = data.body || "New update available";
  const url = data.url || "/home";
  const tag = data.tag || data.id || `ops-${Date.now()}`;

  const options = {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag,
    renotify: true,
    timestamp: Date.now(),
    vibrate: [80, 40, 80],
    data: { url, id: data.id || "", type: data.type || "" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/home";

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });

      for (const client of allClients) {
        try {
          if ("focus" in client) {
            await client.focus();
            if ("navigate" in client) await client.navigate(url);
            return;
          }
        } catch {}
      }

      if (clients.openWindow) return clients.openWindow(url);
    })()
  );
});
