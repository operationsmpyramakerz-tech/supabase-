"use client";

import { useEffect } from "react";

const PAGES = Object.freeze([
  {
    key: "all-tasks",
    name: "All Tasks",
    route: "/next/task-management/all-tasks",
    legacyRoute: "/task-management/all-tasks",
    label: "All Tasks",
    icon: "layers",
  },
  {
    key: "my-tasks",
    name: "My Tasks",
    route: "/next/task-management/my-tasks",
    legacyRoute: "/task-management/my-tasks",
    label: "My Tasks",
    icon: "check-square",
  },
  {
    key: "delegated-tasks",
    name: "Delegated Tasks",
    route: "/next/task-management/delegated-tasks",
    legacyRoute: "/task-management/delegated-tasks",
    label: "Delegated Tasks",
    icon: "send",
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

function allowedTaskPages(allowedPages) {
  const values = normalizedAllowedValues(allowedPages);
  const broad = values.has("task management") || values.has("taskmanagement") || values.has("department tickets") || values.has("/task-management") || values.has("task-management");
  return PAGES.filter((page) => {
    if (broad) return true;
    const name = normalize(page.name);
    const route = normalize(page.route);
    const legacyRoute = normalize(page.legacyRoute);
    return values.has(name) || values.has(route) || values.has(route.replace(/^\//, "")) || values.has(legacyRoute) || values.has(legacyRoute.replace(/^\//, ""));
  });
}

function iconSvg(name) {
  const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  if (name === "check-square") {
    return `<svg ${common}><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`;
  }
  if (name === "send") {
    return `<svg ${common}><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
  }
  return `<svg ${common}><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`;
}

export default function TaskManagementSidebarFlyout({ allowedPages = [], activePath = "" }) {
  useEffect(() => {
    const pages = allowedTaskPages(allowedPages);
    const parent = document.querySelector('.classic-app-shell a.nav-link[href="/next/task-management"]');
    if (!(parent instanceof HTMLAnchorElement)) return undefined;

    const parentLi = parent.closest("li");
    if (parentLi instanceof HTMLElement) parentLi.style.display = pages.length ? "" : "none";
    if (!pages.length) return undefined;

    parent.dataset.taskManagementSubpageCount = String(pages.length);
    parent.setAttribute("aria-haspopup", pages.length > 1 ? "menu" : "false");
    parent.setAttribute("aria-expanded", "false");
    parent.title = pages.length === 1 ? `Task Management · ${pages[0].label}` : "Task Management";
    parent.setAttribute("aria-label", parent.title);

    const currentPath = String(activePath || window.location.pathname || "").replace(/\/+$/, "");
    if (pages.some((page) => currentPath === page.route || currentPath.startsWith(`${page.route}/`))) {
      parent.classList.add("active");
    }

    let panel = document.getElementById("task-management-subpage-flyout-next");
    if (!(panel instanceof HTMLElement)) {
      panel = document.createElement("div");
      panel.id = "task-management-subpage-flyout-next";
      panel.className = "task-management-subpage-flyout";
      panel.hidden = true;
      panel.setAttribute("role", "menu");
      panel.setAttribute("aria-label", "Task Management pages");
      document.body.appendChild(panel);
    }

    const renderPanel = () => {
      const latestPath = String(window.location.pathname || currentPath).replace(/\/+$/, "");
      panel.innerHTML = `<div class="task-management-subpage-flyout__list">${pages.map((page) => {
        const active = latestPath === page.route || latestPath.startsWith(`${page.route}/`);
        return `<a class="task-management-subpage-flyout__link${active ? " is-active" : ""}" href="${page.route}" role="menuitem">${iconSvg(page.icon)}<span>${page.label}</span></a>`;
      }).join("")}</div>`;
    };

    const positionPanel = () => {
      const rect = parent.getBoundingClientRect();
      const width = Math.min(224, Math.max(160, window.innerWidth - 24));
      const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right + 10));
      const estimatedHeight = 10 + (pages.length * 46) + 10;
      const top = Math.min(window.innerHeight - estimatedHeight - 12, Math.max(12, rect.top - 10));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };

    const closePanel = () => {
      panel.hidden = true;
      panel.classList.remove("is-open");
      parent.setAttribute("aria-expanded", "false");
    };

    const openPanel = () => {
      renderPanel();
      positionPanel();
      panel.hidden = false;
      requestAnimationFrame(() => panel.classList.add("is-open"));
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

    parent.addEventListener("click", onParentClick);
    document.addEventListener("pointerdown", onDocumentPointer);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      parent.removeEventListener("click", onParentClick);
      document.removeEventListener("pointerdown", onDocumentPointer);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      closePanel();
      panel.remove();
    };
  }, [allowedPages, activePath]);

  return null;
}
