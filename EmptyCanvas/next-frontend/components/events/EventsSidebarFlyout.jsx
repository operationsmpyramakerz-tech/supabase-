"use client";

import { useEffect } from "react";

const PAGES = Object.freeze([
  {
    key: "calendar",
    name: "Event Calendar",
    route: "/next/events-calendar",
    legacyRoute: "/events/calendar",
    label: "Calendar",
    icon: "calendar",
  },
  {
    key: "requests",
    name: "Event Requests",
    route: "/next/events",
    legacyRoute: "/events/requests",
    label: "Event Requests",
    icon: "clipboard",
  },
  {
    key: "components",
    name: "Event Components",
    route: "/next/event-components",
    legacyRoute: "/events/components",
    label: "Event Components",
    icon: "layers",
  },
]);

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizedAllowedValues(allowedPages) {
  const values = new Set();
  for (const value of Array.isArray(allowedPages) ? allowedPages : []) {
    const raw = normalize(value);
    if (!raw) continue;
    values.add(raw);
    values.add(raw.replace(/\/+$/, ""));
    if (raw.startsWith("/next/")) values.add(raw.slice(5));
    if (raw.startsWith("/")) values.add(raw.slice(1));
    else values.add(`/${raw}`);
  }
  return values;
}

function allowedEventPages(allowedPages) {
  const values = normalizedAllowedValues(allowedPages);
  const broad = values.has("events") || values.has("/events") || values.has("events page");
  return PAGES.filter((page) => {
    if (broad) return true;
    const name = normalize(page.name);
    const route = normalize(page.route);
    const legacyRoute = normalize(page.legacyRoute);
    return values.has(name)
      || values.has(route)
      || values.has(route.replace(/^\//, ""))
      || values.has(legacyRoute)
      || values.has(legacyRoute.replace(/^\//, ""));
  });
}

function iconSvg(name) {
  const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  if (name === "calendar") {
    return `<svg ${common}><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
  }
  if (name === "clipboard") {
    return `<svg ${common}><path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3"></path><rect x="9" y="3" width="6" height="4" rx="2"></rect><line x1="8" y1="12" x2="16" y2="12"></line><line x1="8" y1="16" x2="16" y2="16"></line></svg>`;
  }
  return `<svg ${common}><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`;
}

export default function EventsSidebarFlyout({ allowedPages = [], activePath = "" }) {
  useEffect(() => {
    const pages = allowedEventPages(allowedPages);
    const parent = document.querySelector('.classic-app-shell a.nav-link[href="/next/events"]');
    if (!(parent instanceof HTMLAnchorElement)) return undefined;

    const parentLi = parent.closest("li");
    if (parentLi instanceof HTMLElement) parentLi.style.display = pages.length ? "" : "none";
    if (!pages.length) return undefined;

    parent.dataset.eventsSubpageCount = String(pages.length);
    parent.setAttribute("aria-haspopup", pages.length > 1 ? "menu" : "false");
    parent.setAttribute("aria-expanded", "false");
    parent.title = pages.length === 1 ? `Events · ${pages[0].label}` : "Events";
    parent.setAttribute("aria-label", parent.title);

    const currentPath = String(activePath || window.location.pathname || "").replace(/\/+$/, "");
    if (pages.some((page) => currentPath === page.route || currentPath.startsWith(`${page.route}/`))) {
      parent.classList.add("active");
    }

    let panel = document.getElementById("events-secondary-sidebar-next");
    if (!(panel instanceof HTMLElement)) {
      panel = document.createElement("aside");
      panel.id = "events-secondary-sidebar-next";
      // Reuse the exact same secondary-sidebar language already approved for
      // Task Management, while keeping an Events-specific hook for future use.
      panel.className = "task-management-secondary-sidebar events-secondary-sidebar";
      panel.setAttribute("role", "menu");
      panel.setAttribute("aria-label", "Events pages");
      panel.setAttribute("aria-hidden", "true");
      document.body.appendChild(panel);
    }

    const renderPanel = () => {
      const latestPath = String(window.location.pathname || currentPath).replace(/\/+$/, "");
      panel.innerHTML = `<div class="task-management-secondary-sidebar__rail events-secondary-sidebar__rail">${pages.map((page) => {
        const active = latestPath === page.route || latestPath.startsWith(`${page.route}/`);
        return `<a class="task-management-secondary-sidebar__link events-secondary-sidebar__link${active ? " is-active" : ""}" href="${page.route}" role="menuitem" aria-label="${page.label}">${iconSvg(page.icon)}<span>${page.label}</span></a>`;
      }).join("")}</div>`;
    };

    const positionPanel = () => {
      const rect = parent.getBoundingClientRect();
      const sidebar = parent.closest(".sidebar");
      const isMobileDock = window.matchMedia("(max-width: 768px)").matches;

      if (isMobileDock) {
        panel.style.removeProperty("left");
        panel.style.removeProperty("top");
        panel.style.removeProperty("height");
        return;
      }

      const sidebarRect = sidebar instanceof HTMLElement ? sidebar.getBoundingClientRect() : rect;
      const panelHeight = Math.max(156, panel.offsetHeight || (pages.length * 52 + 28));
      const viewportPadding = 14;
      const idealTop = rect.top + (rect.height / 2) - (panelHeight / 2);
      const top = Math.min(window.innerHeight - panelHeight - viewportPadding, Math.max(viewportPadding, idealTop));

      panel.style.left = `${Math.round(sidebarRect.right - 18)}px`;
      panel.style.top = `${Math.round(top)}px`;
    };

    const closePanel = () => {
      panel.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
      parent.setAttribute("aria-expanded", "false");
    };

    const openPanel = () => {
      renderPanel();
      panel.classList.add("is-positioning");
      panel.setAttribute("aria-hidden", "false");
      positionPanel();
      requestAnimationFrame(() => {
        panel.classList.remove("is-positioning");
        requestAnimationFrame(() => panel.classList.add("is-open"));
      });
      parent.setAttribute("aria-expanded", "true");
    };

    const onParentClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (pages.length === 1) {
        window.location.assign(pages[0].route);
        return;
      }
      if (panel.classList.contains("is-open")) closePanel();
      else openPanel();
    };

    const onPanelClick = (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("a.events-secondary-sidebar__link")) closePanel();
    };

    const onDocumentPointer = (event) => {
      if (!panel.classList.contains("is-open")) return;
      const target = event.target;
      if (target instanceof Node && (panel.contains(target) || parent.contains(target))) return;
      closePanel();
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") closePanel();
    };

    const onViewportChange = () => {
      if (panel.classList.contains("is-open")) positionPanel();
    };

    renderPanel();
    parent.addEventListener("click", onParentClick);
    panel.addEventListener("click", onPanelClick);
    document.addEventListener("pointerdown", onDocumentPointer);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      parent.removeEventListener("click", onParentClick);
      panel.removeEventListener("click", onPanelClick);
      document.removeEventListener("pointerdown", onDocumentPointer);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      closePanel();
      panel.remove();
    };
  }, [allowedPages, activePath]);

  return null;
}
