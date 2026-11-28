"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function DockIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "task" ? <><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" /><path d="m7.5 12 3 3 6-6" /></>
        : name === "project" ? <><circle cx="6" cy="5" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="6" cy="19" r="2.5" /><path d="M6 7.5v9M18 8.5c0 6-4 9-9.5 10" /></>
        : name === "close" ? <path d="m5 5 14 14M19 5 5 19" />
        : <path d="M12 4v16M4 12h16" />}
    </svg>
  );
}

// Keep the existing authorized navigation list intact. The separate creation
// rail is a portal into its real dock, mounted only for this delegated view.
export default function DelegatedTaskAddDock({ onTask, onProject }) {
  const [host, setHost] = useState(null);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rail = useRef(null);
  const trigger = useRef(null);

  useLayoutEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    let currentHost = null;
    const syncHost = () => {
      const candidate = media.matches ? document.querySelector(".classic-app-shell > .sidebar.mobile-dock-structured-host > .sidebar-nav") : null;
      // Wait for ClassicMobileDockStructure to finish moving the original
      // navigation items into their independent rails.
      const next = candidate?.querySelector(":scope > .mobile-dock-home-rail")
        && candidate?.querySelector(":scope > .mobile-dock-pages-clip") ? candidate : null;
      if (currentHost === next) return;
      currentHost = next;
      setHost(next);
      setOpen(false);
    };
    syncHost();
    // Handles persistent-shell swaps and initial hydration ordering. It does
    // not move, clone, or modify any existing navigation element.
    const observer = new MutationObserver(syncHost);
    observer.observe(document.body, { childList: true, subtree: true });
    media.addEventListener("change", syncHost);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", syncHost);
    };
  }, []);

  useLayoutEffect(() => {
    if (!host) return;
    const clip = host.querySelector(":scope > .mobile-dock-pages-clip");
    if (!clip) return;
    let frame = 0;
    const revealActive = () => {
      const active = clip.querySelector(".nav-link.active");
      if (!active) return;
      const bounds = clip.getBoundingClientRect();
      const item = active.getBoundingClientRect();
      // Reflowing to three rails can shrink the middle one. Keep the selected
      // page visible, but do not recenter or interfere with manual swipes.
      if (item.left < bounds.left + 5) clip.scrollLeft -= bounds.left + 5 - item.left;
      else if (item.right > bounds.right - 5) clip.scrollLeft += item.right - bounds.right + 5;
      clip.dispatchEvent(new Event("scroll"));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(revealActive);
    };
    schedule();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(clip);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [host]);

  useEffect(() => {
    if (!open || !host) return;
    const dismissOutside = (event) => {
      if (!rail.current?.contains(event.target)) setOpen(false);
    };
    const dismissEscape = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    };
    const dismissScroll = () => setOpen(false);
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("keydown", dismissEscape);
    // When the dock slides away on scroll, never leave a stale flyout open.
    document.addEventListener("scroll", dismissScroll, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("keydown", dismissEscape);
      document.removeEventListener("scroll", dismissScroll, true);
    };
  }, [open, host]);

  if (!host) return null;

  const choose = (callback) => {
    setOpen(false);
    callback();
  };

  return createPortal(
    <div className="tm-delegated-add-dock" ref={rail}>
      <button
        className="tm-delegated-add-dock__trigger"
        type="button"
        ref={trigger}
        aria-label={open ? "Close add menu" : "Add new task or project"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className="tm-delegated-add-dock__accent"><DockIcon name="plus" /></span>
      </button>
      {/* Keep the same panel for opening and closing transitions. A closed
          panel is immediately excluded from pointer, tab and AT interaction. */}
      <div className="tm-delegated-add-menu" id={panelId} role="group" aria-label="Add new"
        data-open={open} aria-hidden={!open} inert={!open}>
        <button type="button" className="tm-delegated-add-menu__choice" onClick={() => choose(onTask)}>
          <span className="tm-delegated-add-menu__icon"><DockIcon name="task" /></span><strong>Task</strong>
        </button>
        <button type="button" className="tm-delegated-add-menu__choice" onClick={() => choose(onProject)}>
          <span className="tm-delegated-add-menu__icon"><DockIcon name="project" /></span><strong>Project</strong>
        </button>
      </div>
    </div>,
    host,
  );
}
