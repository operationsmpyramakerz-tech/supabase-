(function () {
  window.OpsPWAInstall = window.OpsPWAInstall || {
    deferredPrompt: null,
    lastOutcome: null,
    installedAt: null,
    manifestCheckedAt: null,
    serviceWorkerReady: false,
    serviceWorkerControlled: false,
    installHint: '',
    manifest: null,
    isStandalone() {
      try {
        return window.matchMedia('(display-mode: standalone)').matches ||
          window.navigator.standalone === true ||
          document.referrer.startsWith('android-app://');
      } catch {
        return false;
      }
    },
    canPrompt() {
      return !!this.deferredPrompt;
    },
  };

  if (!window.__opsPwaInstallPromptBound) {
    window.__opsPwaInstallPromptBound = true;

    window.addEventListener('beforeinstallprompt', (event) => {
      try { event.preventDefault(); } catch {}
      window.OpsPWAInstall.deferredPrompt = event;
      window.OpsPWAInstall.installHint = 'ready';
      try { window.dispatchEvent(new CustomEvent('ops:pwa-install-available')); } catch {}
    });

    window.addEventListener('appinstalled', () => {
      window.OpsPWAInstall.deferredPrompt = null;
      window.OpsPWAInstall.lastOutcome = 'accepted';
      window.OpsPWAInstall.installedAt = Date.now();
      window.OpsPWAInstall.installHint = 'installed';
      try { window.dispatchEvent(new CustomEvent('ops:pwa-installed')); } catch {}
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/service-worker.js', { scope: '/' })
      .then((registration) => {
        window.OpsPWAInstall.serviceWorkerReady = true;
        window.OpsPWAInstall.serviceWorkerControlled = !!navigator.serviceWorker.controller;
        try { registration.update(); } catch {}

        // If this is the very first SW activation, reload once so Chrome sees
        // the current page as controlled. This is often the difference between
        // "Create shortcut" and the real install prompt on Android.
        if (!navigator.serviceWorker.controller) {
          try {
            const key = 'ops.pwa.controller.reload.v1';
            const last = Number(sessionStorage.getItem(key) || 0);
            if (!last || Date.now() - last > 10 * 60 * 1000) {
              sessionStorage.setItem(key, String(Date.now()));
              navigator.serviceWorker.addEventListener('controllerchange', () => {
                try { window.OpsPWAInstall.serviceWorkerControlled = true; } catch {}
              });
            }
          } catch {}
        }
      })
      .catch((error) => {
        window.OpsPWAInstall.serviceWorkerReady = false;
        window.OpsPWAInstall.serviceWorkerControlled = false;
        try { console.warn('Service worker registration failed:', error); } catch {}
      });

    try {
      navigator.serviceWorker.ready.then(() => {
        window.OpsPWAInstall.serviceWorkerReady = true;
        window.OpsPWAInstall.serviceWorkerControlled = !!navigator.serviceWorker.controller;
      }).catch(() => {});
    } catch {}
  }

  registerServiceWorker();

  // Lightweight manifest check for the App window diagnostic text.
  function checkManifest() {
    try {
      fetch('/manifest.webmanifest', { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : null)
        .then((manifest) => {
          if (!manifest) return;
          window.OpsPWAInstall.manifestCheckedAt = Date.now();
          window.OpsPWAInstall.manifest = manifest;
        })
        .catch(() => {});
    } catch {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkManifest, { once: true });
  } else {
    checkManifest();
  }
})();
