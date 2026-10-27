"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const PAGES = Object.freeze([
  {
    key: "request-products",
    name: "Request Products",
    route: "/next/orders/new/request-products",
    label: "Request Products",
    icon: "shopping-cart",
  },
  {
    key: "withdraw-products",
    name: "Withdraw Products",
    route: "/next/orders/new/withdraw-products",
    label: "Withdraw Products",
    icon: "log-out",
  },
  {
    key: "request-maintenance",
    name: "Request Maintenance",
    route: "/next/orders/new/request-maintenance",
    label: "Request Maintenance",
    icon: "tool",
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

function allowedShoppingPages(allowedPages) {
  const values = normalizedAllowedValues(allowedPages);
  const broad = values.has("create new order")
    || values.has("shopping cart")
    || values.has("cart")
    || values.has("/orders/new")
    || values.has("orders/new");

  return PAGES.filter((page) => {
    if (broad) return true;
    const name = normalize(page.name);
    const route = normalize(page.route);
    return values.has(name)
      || values.has(route)
      || values.has(route.replace(/^\/next/, ""))
      || values.has(route.replace(/^\//, ""));
  });
}

function iconSvg(name) {
  const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  if (name === "shopping-cart") {
    return `<svg ${common}><circle cx="9" cy="20" r="1"></circle><circle cx="20" cy="20" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>`;
  }
  if (name === "log-out") {
    return `<svg ${common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`;
  }
  return `<svg ${common}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`;
}

function toNextClientRoute(value) {
  const raw = String(value || "").trim() || "/";
  if (raw === "/next") return "/";
  if (raw.startsWith("/next/")) return raw.slice(5) || "/";
  return raw;
}

export default function ShoppingCartSidebarFlyout({ allowedPages = [], activePath = "" }) {
  const router = useRouter();

  useEffect(() => {
    const pages = allowedShoppingPages(allowedPages);
    const parent = document.querySelector('.classic-app-shell a.nav-link[href="/next/orders/new"]');
    if (!(parent instanceof HTMLAnchorElement)) return undefined;

    const parentLi = parent.closest("li");
    if (parentLi instanceof HTMLElement) parentLi.style.display = pages.length ? "" : "none";
    if (!pages.length) return undefined;

    parent.dataset.shoppingCartSubpageCount = String(pages.length);
    parent.setAttribute("aria-haspopup", pages.length > 1 ? "menu" : "false");
    parent.setAttribute("aria-expanded", "false");
    parent.title = pages.length === 1 ? `Shopping Cart · ${pages[0].label}` : "Shopping Cart";
    parent.setAttribute("aria-label", parent.title);

    const currentPath = String(activePath || window.location.pathname || "").replace(/\/+$/, "");
    if (pages.some((page) => currentPath === page.route || currentPath.startsWith(`${page.route}/`))) {
      parent.classList.add("active");
    }

    let panel = document.getElementById("shopping-cart-secondary-sidebar-next");
    if (!(panel instanceof HTMLElement)) {
      panel = document.createElement("aside");
      panel.id = "shopping-cart-secondary-sidebar-next";
      panel.className = "task-management-secondary-sidebar shopping-cart-secondary-sidebar";
      panel.setAttribute("role", "menu");
      panel.setAttribute("aria-label", "Shopping Cart pages");
      panel.setAttribute("aria-hidden", "true");
      document.body.appendChild(panel);
    }

    const renderPanel = () => {
      const latestPath = String(window.location.pathname || currentPath).replace(/\/+$/, "");
      panel.innerHTML = `<div class="task-management-secondary-sidebar__rail shopping-cart-secondary-sidebar__rail">${pages.map((page) => {
        const active = latestPath === page.route || latestPath.startsWith(`${page.route}/`);
        return `<a class="task-management-secondary-sidebar__link shopping-cart-secondary-sidebar__link${active ? " is-active" : ""}" href="${page.route}" role="menuitem" aria-label="${page.label}">${iconSvg(page.icon)}<span>${page.label}</span></a>`;
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
        router.push(toNextClientRoute(pages[0].route));
        return;
      }
      if (panel.classList.contains("is-open")) closePanel();
      else openPanel();
    };

    const onPanelClick = (event) => {
      const target = event.target;
      const link = target instanceof Element ? target.closest("a.shopping-cart-secondary-sidebar__link") : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      event.preventDefault();
      closePanel();
      router.push(toNextClientRoute(link.getAttribute("href") || link.pathname));
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
  }, [allowedPages, activePath, router]);

  return null;
}
