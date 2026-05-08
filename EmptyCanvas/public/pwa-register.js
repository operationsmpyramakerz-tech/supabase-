(function () {
  // Register this file as early as possible on every page so we never miss
  // Chrome's beforeinstallprompt event.
  window.OpsPWAInstall = window.OpsPWAInstall || {
    deferredPrompt: null,
    lastOutcome: null,
    installedAt: null,
    manifestCheckedAt: null,
    serviceWorkerReady: false,
    installHint: '',
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

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js', { scope: '/' })
        .then((registration) => {
          window.OpsPWAInstall.serviceWorkerReady = true;
          // Ask Chrome to re-check the service worker after deployments.
          try { registration.update(); } catch {}
        })
        .catch((error) => {
          window.OpsPWAInstall.serviceWorkerReady = false;
          try { console.warn('Service worker registration failed:', error); } catch {}
        });
    });
  }

  // Lightweight manifest check for the App window diagnostic text.
  window.addEventListener('load', () => {
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
  });
})();
