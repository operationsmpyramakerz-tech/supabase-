"use client";

import { useEffect, useLayoutEffect } from "react";

const COLLAPSED_KEY = "ui.sidebarCollapsed";
const SIDEBAR_SCROLL_KEY = "ui.sidebarScrollTop";
const SIDEBAR_SCROLL_LEFT_KEY = "ui.sidebarScrollLeft";
const SIDEBAR_SCROLL_COOKIE = "ops_ui_sidebar_scroll_top_v1";
const SIDEBAR_SCROLL_LEFT_COOKIE = "ops_ui_sidebar_scroll_left_v1";

const CHROME_CACHE_KEY = "ops.ui.chrome.v1";
const ALLOWED_PAGES_KEY = "allowedPages";
const ALLOWED_PAGES_COOKIE = "ops_ui_allowed_pages_v1";

function setCollapsed(collapsed) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("sidebar-collapsed", Boolean(collapsed));
  try { localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0"); } catch {}
}

function toggleCollapsed() {
  if (typeof document === "undefined") return;
  setCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

export function BodyClassSync({ className = "" }) {
  useLayoutEffect(() => {
    const classes = String(className || "").split(/\s+/).filter(Boolean);

    // Route loading UIs and the fully-rendered pages both depend on these body
    // classes for their final spacing/geometry.  Applying them in a normal
    // effect allows one browser paint with the generic Classic dimensions,
    // then a second paint with the page-specific dimensions — which makes the
    // shell visibly jump during navigation.  A layout effect runs in the same
    // commit, before paint, so loading and settled states use one geometry.
    classes.forEach((value) => document.body.classList.add(value));
    return () => {
      // Keep the shared shell class alive across App Router route transitions.
      // Loading fallbacks are streamed before their client effects hydrate; if
      // the previous page removes this class first, the shell briefly falls
      // back to the legacy spacing and the whole page appears to jump.
      // Page-specific classes are still cleaned normally.
      classes.forEach((value) => {
        if (value === "next-classic-shell-active") return;
        document.body.classList.remove(value);
      });
    };
  }, [className]);
  return null;
}


export function ClassicChromeAccessSync({ account }) {
  const hasAllowedPages = Array.isArray(account?.allowedPages);
  const allowedPages = hasAllowedPages ? account.allowedPages : null;
  const coverPhotoUrl = String(account?.coverPhotoUrl || account?.coverPhoto || "").trim();

  useLayoutEffect(() => {
    // Keep the system cover on the persistent <html> element instead of only
    // on the route-owned .main-content node. Next.js swaps that node for each
    // route loading fallback; keeping the cover variable/class at the root
    // means navigation can replace only the page content without flashing the
    // white loading canvas or re-resolving the cover image every time.
    const root = document.documentElement;
    if (coverPhotoUrl) {
      root.classList.add("ops-has-persistent-cover");
      root.style.setProperty("--ops-system-cover-image", `url(${JSON.stringify(coverPhotoUrl)})`);

      // Warm the decoded image once. Subsequent route transitions reuse the
      // same browser resource while only the page content changes.
      try {
        const image = new Image();
        image.decoding = "async";
        image.src = coverPhotoUrl;
      } catch {}
    } else {
      root.classList.remove("ops-has-persistent-cover");
      root.style.removeProperty("--ops-system-cover-image");
    }

    // Keep the loading/transition shell on the exact same permission snapshot
    // as the fully rendered page.  The loading sidebar cannot read the server
    // account prop directly, so persist the current user's resolved access as
    // soon as the live shell mounts.
    if (!hasAllowedPages) return;

    try {
      sessionStorage.setItem(ALLOWED_PAGES_KEY, JSON.stringify(allowedPages));
    } catch {}

    // Server-rendered route loading states cannot read sessionStorage/localStorage.
    // Keep a compact permission snapshot in a same-site cookie so the loading
    // sidebar can render the exact same authorized links before hydration.
    try {
      const encoded = encodeURIComponent(JSON.stringify(allowedPages));
      document.cookie = `${ALLOWED_PAGES_COOKIE}=${encoded}; Path=/; Max-Age=43200; SameSite=Lax`;
    } catch {}

    try {
      let current = {};
      try {
        const parsed = JSON.parse(localStorage.getItem(CHROME_CACHE_KEY) || "null");
        if (parsed && typeof parsed === "object") current = parsed;
      } catch {}

      const name = String(account?.name || account?.username || current?.name || current?.username || "").trim();
      const photoUrl = String(account?.photoUrl || account?.profilePicture || current?.photoUrl || "").trim();

      localStorage.setItem(CHROME_CACHE_KEY, JSON.stringify({
        ...current,
        ...(name ? { name, username: name } : {}),
        ...(photoUrl ? { photoUrl } : {}),
        ...(coverPhotoUrl ? { coverPhotoUrl } : {}),
        allowedPages,
        savedAt: Date.now(),
      }));
    } catch {}
  }, [account, allowedPages, hasAllowedPages, coverPhotoUrl]);

  return null;
}

export function ClassicSidebarBootstrap() {
  useEffect(() => {
    let collapsed = false;
    try {
      const saved = localStorage.getItem(COLLAPSED_KEY);
      collapsed = saved === "1";
    } catch {}
    setCollapsed(collapsed);
    // Keep the persisted class during route transitions so the loading shell
    // does not briefly jump to the expanded state before the next page mounts.
    return undefined;
  }, []);
  return null;
}



export function ClassicMobileDockStructure() {
  useLayoutEffect(() => {
    const sidebar = document.querySelector(".classic-app-shell .sidebar");
    const nav = sidebar?.querySelector(":scope > .sidebar-nav");
    if (!(sidebar instanceof HTMLElement) || !(nav instanceof HTMLElement)) return undefined;

    const MOBILE_QUERY = "(max-width: 768px)";
    const media = window.matchMedia(MOBILE_QUERY);

    const structure = () => {
      const directList = nav.querySelector(":scope > .nav-list");
      const existingHome = nav.querySelector(":scope > .mobile-dock-home-rail");
      const existingClip = nav.querySelector(":scope > .mobile-dock-pages-clip");

      if (!media.matches) {
        if (existingHome && existingClip) {
          const list = existingClip.querySelector(":scope > .nav-list");
          const homeLi = existingHome.querySelector(":scope > li");
          if (list) {
            if (homeLi) list.insertBefore(homeLi, list.firstChild);
            nav.insertBefore(list, existingHome);
            list.classList.remove("mobile-dock-pages-list");
          }
          existingHome.remove();
          existingClip.remove();
        }
        nav.classList.remove("mobile-dock-structured");
        sidebar.classList.remove("mobile-dock-structured-host");
        return;
      }

      if (existingHome && existingClip) {
        nav.classList.add("mobile-dock-structured");
        sidebar.classList.add("mobile-dock-structured-host");
        return;
      }

      if (!(directList instanceof HTMLUListElement)) return;
      const homeLi = directList.querySelector(":scope > li:first-child");
      if (!(homeLi instanceof HTMLLIElement)) return;

      const homeRail = document.createElement("ul");
      homeRail.className = "mobile-dock-home-rail";
      homeRail.setAttribute("aria-label", "Home navigation");

      const pagesClip = document.createElement("div");
      pagesClip.className = "mobile-dock-pages-clip";
      pagesClip.setAttribute("role", "group");
      pagesClip.setAttribute("aria-label", "Pages navigation");

      nav.insertBefore(homeRail, directList);
      nav.insertBefore(pagesClip, directList);
      homeRail.appendChild(homeLi);
      pagesClip.appendChild(directList);
      directList.classList.add("mobile-dock-pages-list");
      nav.classList.add("mobile-dock-structured");
      sidebar.classList.add("mobile-dock-structured-host");
    };

    structure();
    const onChange = () => structure();
    if (typeof media.addEventListener === "function") media.addEventListener("change", onChange);
    else media.addListener?.(onChange);
    window.addEventListener("orientationchange", onChange);

    return () => {
      if (typeof media.removeEventListener === "function") media.removeEventListener("change", onChange);
      else media.removeListener?.(onChange);
      window.removeEventListener("orientationchange", onChange);
    };
  }, []);
  return null;
}

export function ClassicSidebarViewportKeeper() {
  useLayoutEffect(() => {
    const sidebar = document.querySelector(".classic-app-shell .sidebar");
    const nav = sidebar?.querySelector(":scope > .sidebar-nav");
    if (!(sidebar instanceof HTMLElement) || !(nav instanceof HTMLElement)) return undefined;

    const pagesClip = nav.querySelector(":scope > .mobile-dock-pages-clip");
    const horizontalScroller = pagesClip instanceof HTMLElement ? pagesClip : null;

    let hadSavedViewport = false;
    try {
      if (horizontalScroller) {
        const rawSavedLeft = sessionStorage.getItem(SIDEBAR_SCROLL_LEFT_KEY);
        const savedLeft = rawSavedLeft === null ? NaN : Number(rawSavedLeft);
        if (Number.isFinite(savedLeft) && savedLeft >= 0) {
          horizontalScroller.scrollLeft = savedLeft;
          hadSavedViewport = true;
        }
      } else {
        const rawSaved = sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
        const saved = rawSaved === null ? NaN : Number(rawSaved);
        if (Number.isFinite(saved) && saved >= 0) {
          nav.scrollTop = saved;
          hadSavedViewport = true;
        }
      }
    } catch {}

    // The loading sidebar uses a server-rendered visual offset so its first
    // streamed frame already matches the previous sidebar viewport. Once the
    // actual DOM scroll position has been restored, remove that visual fallback
    // before the browser paints the hydrated state.
    sidebar.classList.add("sidebar-viewport-restored");

    const keepActiveVisible = () => {
      // Preserve an existing viewport exactly during route transitions. The
      // destination item was visible when the user clicked it, so re-centering
      // the active item here only creates the visible jump we want to avoid.
      if (hadSavedViewport) return;

      const active = nav.querySelector(".nav-link.active");
      if (!(active instanceof HTMLElement)) return;

      if (horizontalScroller && horizontalScroller.contains(active)) {
        const clipRect = horizontalScroller.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        if (activeRect.left < clipRect.left + 8) {
          horizontalScroller.scrollLeft -= (clipRect.left + 8) - activeRect.left;
        } else if (activeRect.right > clipRect.right - 8) {
          horizontalScroller.scrollLeft += activeRect.right - (clipRect.right - 8);
        }
        return;
      }

      const navRect = nav.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      if (activeRect.top < navRect.top + 8) {
        nav.scrollTop -= (navRect.top + 8) - activeRect.top;
      } else if (activeRect.bottom > navRect.bottom - 8) {
        nav.scrollTop += activeRect.bottom - (navRect.bottom - 8);
      }
    };

    const persistCookie = (name, value) => {
      try {
        const safeValue = Math.max(0, Math.round(Number(value) || 0));
        document.cookie = `${name}=${safeValue}; Path=/; Max-Age=43200; SameSite=Lax`;
      } catch {}
    };

    const rememberVertical = () => {
      const value = Math.max(0, nav.scrollTop || 0);
      try { sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(value)); } catch {}
      persistCookie(SIDEBAR_SCROLL_COOKIE, value);
    };

    const rememberHorizontal = () => {
      if (!horizontalScroller) return;
      const value = Math.max(0, horizontalScroller.scrollLeft || 0);
      try { sessionStorage.setItem(SIDEBAR_SCROLL_LEFT_KEY, String(value)); } catch {}
      persistCookie(SIDEBAR_SCROLL_LEFT_COOKIE, value);
    };

    const rememberViewport = () => {
      rememberVertical();
      rememberHorizontal();
    };

    const frame = window.requestAnimationFrame(() => {
      keepActiveVisible();
      rememberViewport();
    });

    nav.addEventListener("scroll", rememberVertical, { passive: true });
    horizontalScroller?.addEventListener("scroll", rememberHorizontal, { passive: true });
    // Persist the exact current viewport before an anchor navigation starts so
    // the server-rendered loading sidebar receives the latest position cookie.
    nav.addEventListener("pointerdown", rememberViewport, true);
    nav.addEventListener("click", rememberViewport, true);

    return () => {
      window.cancelAnimationFrame(frame);
      rememberViewport();
      nav.removeEventListener("scroll", rememberVertical);
      horizontalScroller?.removeEventListener("scroll", rememberHorizontal);
      nav.removeEventListener("pointerdown", rememberViewport, true);
      nav.removeEventListener("click", rememberViewport, true);
    };
  }, []);
  return null;
}


export function ClassicSidebarActiveIndicator() {
  useLayoutEffect(() => {
    const sidebar = document.querySelector(".classic-app-shell > .sidebar");
    if (!(sidebar instanceof HTMLElement)) return undefined;

    const nav = sidebar.querySelector(":scope > .sidebar-nav");
    if (!(nav instanceof HTMLElement)) return undefined;

    const existing = sidebar.querySelector(":scope > .sidebar-active-indicator");
    existing?.remove();

    const indicator = document.createElement("span");
    indicator.className = "sidebar-active-indicator is-instant";
    indicator.setAttribute("aria-hidden", "true");
    sidebar.appendChild(indicator);

    let visualTarget = null;
    let navigationTimer = 0;
    let frame = 0;

    const isMobile = () => window.matchMedia("(max-width: 768px)").matches;
    const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const visualRectForLink = (link) => {
      if (!(link instanceof HTMLElement)) return null;
      const sidebarRect = sidebar.getBoundingClientRect();
      let targetRect = link.getBoundingClientRect();
      let radius = window.getComputedStyle(link).borderRadius || "16px";

      // On the mobile dock Home uses a circular white surface behind the icon,
      // while page items use the rounded-square active surface. Measure the
      // exact visual surface rather than the much wider Home link container.
      if (isMobile()) {
        const href = String(link.getAttribute("href") || "");
        if (href === "/next/home") {
          const icon = link.querySelector("svg");
          if (icon instanceof SVGElement) {
            targetRect = icon.getBoundingClientRect();
            radius = "999px";
          }
        } else {
          // Inactive mobile page links are slightly smaller than the active
          // surface. Animate the white tile to the final active footprint so it
          // does not shrink while travelling to the destination icon.
          const activeSize = window.innerWidth <= 390 ? 42 : 44;
          const cx = targetRect.left + (targetRect.width / 2);
          const cy = targetRect.top + (targetRect.height / 2);
          targetRect = {
            left: cx - (activeSize / 2),
            top: cy - (activeSize / 2),
            width: activeSize,
            height: activeSize,
          };
          radius = window.innerWidth <= 390 ? "14px" : "15px";
        }
      }

      return {
        x: targetRect.left - sidebarRect.left,
        y: targetRect.top - sidebarRect.top,
        width: targetRect.width,
        height: targetRect.height,
        radius,
      };
    };

    const moveIndicator = (link, instant = false) => {
      if (!(link instanceof HTMLElement)) return;
      const rect = visualRectForLink(link);
      if (!rect) return;

      visualTarget = link;
      if (instant) indicator.classList.add("is-instant");
      indicator.style.width = `${Math.max(0, rect.width)}px`;
      indicator.style.height = `${Math.max(0, rect.height)}px`;
      indicator.style.borderRadius = rect.radius;
      indicator.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
      indicator.style.opacity = "1";

      if (instant) {
        // Force the geometry to commit before enabling transitions so the first
        // render never flies in from the top-left corner of the sidebar.
        indicator.getBoundingClientRect();
        requestAnimationFrame(() => indicator.classList.remove("is-instant"));
      }
    };

    const clearTargets = () => {
      sidebar.querySelectorAll(".nav-link.is-indicator-target").forEach((item) => item.classList.remove("is-indicator-target"));
    };

    const initialize = () => {
      const active = nav.querySelector(".nav-link.active");
      if (!(active instanceof HTMLElement)) {
        indicator.style.opacity = "0";
        return;
      }

      // Keep the settled page on the native .nav-link.active surface. The
      // travelling tile is only needed while a navigation is actually moving.
      // Leaving it visible after hydration can place the white tile above the
      // mobile SVG in a separate stacking context, which makes the active icon
      // look blank. Prime its geometry here, then keep it hidden until click.
      moveIndicator(active, true);
      indicator.style.opacity = "0";
      sidebar.classList.remove("sidebar-active-indicator-ready", "sidebar-active-indicator-animating");
    };

    // The mobile dock DOM is restructured in a sibling layout effect. Waiting
    // one frame guarantees we measure the final geometry without exposing a
    // visible static-to-animated jump.
    frame = requestAnimationFrame(initialize);

    const onClick = (event) => {
      if (!(event instanceof MouseEvent) || event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const origin = event.target;
      const link = origin instanceof Element ? origin.closest("a.nav-link") : null;
      if (!(link instanceof HTMLAnchorElement) || !sidebar.contains(link)) return;
      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;

      const rawHref = String(link.getAttribute("href") || "").trim();
      // Task Management and Events are parent buttons that open the approved
      // secondary sidebar instead of navigating directly. Their own handlers
      // stay fully in control of those interactions.
      if (rawHref === "/next/task-management" || rawHref === "/next/events") return;

      let destination;
      try { destination = new URL(link.href, window.location.href); } catch { return; }
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;

      event.preventDefault();
      clearTargets();

      // Start from the currently active button using an instant frame, then
      // enable the shared travelling surface and animate to the destination.
      // After navigation the new page falls back to its normal active button,
      // so the icon can never be covered by a persistent overlay.
      const currentActive = nav.querySelector(".nav-link.active");
      if (currentActive instanceof HTMLElement) {
        moveIndicator(currentActive, true);
      }

      link.classList.add("is-indicator-target");
      sidebar.classList.add("sidebar-active-indicator-ready", "sidebar-active-indicator-animating");

      // Commit the starting geometry/background removal before travelling.
      indicator.getBoundingClientRect();
      requestAnimationFrame(() => moveIndicator(link, reduceMotion()));

      if (navigationTimer) window.clearTimeout(navigationTimer);
      const delay = reduceMotion() ? 0 : 230;
      navigationTimer = window.setTimeout(() => {
        window.location.assign(destination.href);
      }, delay);
    };

    const syncToCurrentTarget = () => {
      const target = visualTarget instanceof HTMLElement && document.contains(visualTarget)
        ? visualTarget
        : nav.querySelector(".nav-link.active");
      if (!(target instanceof HTMLElement)) return;

      indicator.classList.add("is-instant");
      moveIndicator(target, true);

      // ResizeObserver/scroll callbacks also run after the settled page mounts.
      // They used to turn the primed indicator visible again even though the
      // navigation animation had finished, which covered the active mobile SVG
      // with a plain white tile. Keep the indicator hidden unless an actual
      // navigation animation currently owns it.
      if (!sidebar.classList.contains("sidebar-active-indicator-ready")) {
        indicator.style.opacity = "0";
      }
    };

    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => syncToCurrentTarget())
      : null;
    resizeObserver?.observe(sidebar);
    resizeObserver?.observe(nav);

    const pagesClip = nav.querySelector(":scope > .mobile-dock-pages-clip");
    nav.addEventListener("scroll", syncToCurrentTarget, { passive: true });
    pagesClip?.addEventListener("scroll", syncToCurrentTarget, { passive: true });
    sidebar.addEventListener("click", onClick);
    window.addEventListener("resize", syncToCurrentTarget);
    window.addEventListener("orientationchange", syncToCurrentTarget);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (navigationTimer) window.clearTimeout(navigationTimer);
      resizeObserver?.disconnect();
      nav.removeEventListener("scroll", syncToCurrentTarget);
      pagesClip?.removeEventListener("scroll", syncToCurrentTarget);
      sidebar.removeEventListener("click", onClick);
      window.removeEventListener("resize", syncToCurrentTarget);
      window.removeEventListener("orientationchange", syncToCurrentTarget);
      clearTargets();
      sidebar.classList.remove("sidebar-active-indicator-ready", "sidebar-active-indicator-animating");
      indicator.remove();
    };
  }, []);

  return null;
}

export function SidebarBrandToggle() {
  return (
    <div
      className="sidebar-brand-toggle"
      id="sidebar-logo-toggle"
      role="button"
      tabIndex={0}
      aria-label="Toggle dashboard"
      onClick={toggleCollapsed}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleCollapsed();
        }
      }}
    >
      <img className="brand-logo-full" src="/images/Logo%20horizontal.png" alt="Company logo" />
      <img className="brand-logo-icon" src="/images/logo.png" alt="" aria-hidden="true" />
    </div>
  );
}

export function HeaderMenuToggle() {
  return (
    <button id="menu-toggle" type="button" className="menu-toggle" aria-label="Toggle dashboard" onClick={toggleCollapsed}>
      <img className="menu-toggle-logo" src="/images/logo.png" alt="" />
    </button>
  );
}
