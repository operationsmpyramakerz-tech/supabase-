"use client";

import { useEffect } from "react";

const COLLAPSED_KEY = "ui.sidebarCollapsed";
const SIDEBAR_SCROLL_KEY = "ui.sidebarScrollTop";

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

export function ClassicSidebarViewportKeeper() {
  useEffect(() => {
    const nav = document.querySelector(".classic-app-shell .sidebar-nav");
    if (!(nav instanceof HTMLElement)) return undefined;

    try {
      const saved = Number(sessionStorage.getItem(SIDEBAR_SCROLL_KEY));
      if (Number.isFinite(saved) && saved > 0) nav.scrollTop = saved;
    } catch {}

    const keepActiveVisible = () => {
      const active = nav.querySelector(".nav-link.active");
      if (!(active instanceof HTMLElement)) return;
      const navRect = nav.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      if (activeRect.top < navRect.top + 8) {
        nav.scrollTop -= (navRect.top + 8) - activeRect.top;
      } else if (activeRect.bottom > navRect.bottom - 8) {
        nav.scrollTop += activeRect.bottom - (navRect.bottom - 8);
      }
    };

    const frame = window.requestAnimationFrame(keepActiveVisible);
    const remember = () => {
      try { sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(nav.scrollTop)); } catch {}
    };
    nav.addEventListener("scroll", remember, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      remember();
      nav.removeEventListener("scroll", remember);
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
