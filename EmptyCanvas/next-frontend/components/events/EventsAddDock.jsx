"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EventIcon from "./EventIcon";

// Keep the existing authorized navigation list intact. The separate creation
// rail is a portal into its real dock, mounted only for the authorized Events calendar.
export default function EventsAddDock({ onCreate, canConfirm }) {
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
    if (!open) return;
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
    // Keyboard navigation leaving the chooser also restores the sharp page.
    document.addEventListener("focusin", dismissOutside, true);
    document.addEventListener("keydown", dismissEscape);
    // When the dock slides away on scroll, never leave a stale flyout open.
    document.addEventListener("scroll", dismissScroll, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("focusin", dismissOutside, true);
      document.removeEventListener("keydown", dismissEscape);
      document.removeEventListener("scroll", dismissScroll, true);
    };
  }, [open, host]);

  const choose = (status) => {
    if (status === "confirmed" && !canConfirm) return;
    setOpen(false);
    onCreate(status);
  };

  const panel = (
    <div className="events-add-menu" id={panelId} role="group" aria-label="Add event type"
      data-open={open} aria-hidden={!open} inert={!open}>
      <button type="button" className="events-add-menu__choice" disabled={!canConfirm}
        title={canConfirm ? undefined : "Event confirmation permission is required"}
        onClick={() => choose("confirmed")}>
        <span className="events-add-menu__icon is-confirmed"><EventIcon name="check-circle" /></span>
        <strong>Confirmed Event</strong>
      </button>
      <button type="button" className="events-add-menu__choice" onClick={() => choose("pending")}>
        <span className="events-add-menu__icon is-pending"><EventIcon name="clock" /></span>
        <strong>Pending Confirmation</strong>
      </button>
    </div>
  );

  if (!host) return (
    <div className="events-add-inline" ref={rail}>
      <button type="button" className="agenda-add" ref={trigger} aria-expanded={open}
        aria-controls={panelId} onClick={() => setOpen(value => !value)}>
        <EventIcon name="plus-circle" />Add New Event
      </button>
      {panel}
    </div>
  );

  return createPortal(
    <div className="events-add-dock" ref={rail}>
      <button
        className="events-add-dock__trigger"
        type="button"
        ref={trigger}
        aria-label={open ? "Close add event menu" : "Add new event"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(previous => !previous)}
      >
        <span className="events-add-dock__accent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 4v16M4 12h16" /></svg></span>
      </button>
      {panel}
    </div>,
    host,
  );
}
