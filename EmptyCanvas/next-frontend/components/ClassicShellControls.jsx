"use client";

import { useEffect, useLayoutEffect } from "react";

const COLLAPSED_KEY = "ui.sidebarCollapsed";
const SIDEBAR_SCROLL_KEY = "ui.sidebarScrollTop";
const SIDEBAR_SCROLL_LEFT_KEY = "ui.sidebarScrollLeft";

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
  useEffect(() => {
    const classes = String(className || "").split(/\s+/).filter(Boolean);
    classes.forEach((value) => document.body.classList.add(value));
    return () => classes.forEach((value) => document.body.classList.remove(value));
  }, [className]);
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
  useEffect(() => {
    const nav = document.querySelector(".classic-app-shell .sidebar-nav");
    if (!(nav instanceof HTMLElement)) return undefined;

    const pagesClip = nav.querySelector(":scope > .mobile-dock-pages-clip");
    const horizontalScroller = pagesClip instanceof HTMLElement ? pagesClip : null;

    try {
      if (horizontalScroller) {
        const savedLeft = Number(sessionStorage.getItem(SIDEBAR_SCROLL_LEFT_KEY));
        if (Number.isFinite(savedLeft) && savedLeft > 0) horizontalScroller.scrollLeft = savedLeft;
      } else {
        const saved = Number(sessionStorage.getItem(SIDEBAR_SCROLL_KEY));
        if (Number.isFinite(saved) && saved > 0) nav.scrollTop = saved;
      }
    } catch {}

    const keepActiveVisible = () => {
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

    const frame = window.requestAnimationFrame(keepActiveVisible);
    const rememberVertical = () => {
      try { sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(nav.scrollTop)); } catch {}
    };
    const rememberHorizontal = () => {
      if (!horizontalScroller) return;
      try { sessionStorage.setItem(SIDEBAR_SCROLL_LEFT_KEY, String(horizontalScroller.scrollLeft)); } catch {}
    };

    nav.addEventListener("scroll", rememberVertical, { passive: true });
    horizontalScroller?.addEventListener("scroll", rememberHorizontal, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      rememberVertical();
      rememberHorizontal();
      nav.removeEventListener("scroll", rememberVertical);
      horizontalScroller?.removeEventListener("scroll", rememberHorizontal);
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
