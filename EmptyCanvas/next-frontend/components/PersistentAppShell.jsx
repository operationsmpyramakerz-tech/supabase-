"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import AppShell from "./AppShell";
import { PersistentShellProvider } from "./PersistentShellContext";

function localPathname(value) {
  let pathname = String(value || "/").trim() || "/";
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  pathname = pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/next") return "/";
  if (pathname.startsWith("/next/")) return pathname.slice(5) || "/";
  return pathname;
}

function publicPathname(localPath) {
  return localPath === "/" ? "/next" : `/next${localPath}`;
}

function routePerformanceStyles(localPath) {
  // Keep large late-stage parity rules off the global shell. These bundles are
  // exact extractions from the tail of classic-parity.css, so the route keeps
  // the same cascade while unrelated pages avoid parsing those selectors.
  if (["/orders", "/orders-review", "/operations-orders"].includes(localPath)) {
    return [
      "/next/css/orders-performance.css?v=css-phase1",
      "/next/css/order-mobile-performance.css?v=css-phase3",
    ];
  }
  if (localPath === "/maintenance-orders") {
    return [
      "/next/css/maintenance-orders.css?v=maintenance-details-v3",
      "/next/css/order-mobile-performance.css?v=css-phase3",
    ];
  }
  if (localPath === "/orders/new" || localPath.startsWith("/orders/new/")) {
    return ["/next/css/shopping-cart.css?v=order-confirmation-v5-undo-explosion"];
  }
  if (localPath === "/products") {
    return ["/next/css/products-stocktaking-performance.css?v=css-phase2"];
  }
  if (localPath === "/stocktaking") {
    return [
      "/next/css/products-stocktaking-performance.css?v=css-phase2",
      "/next/css/stocktaking-performance.css?v=css-phase2",
      "/next/css/stocktaking-proposals-performance.css?v=css-phase2",
      "/next/css/stocktaking-after-shared-performance.css?v=css-phase2",
    ];
  }
  if (localPath === "/kits") {
    return ["/next/css/proposals-kits-performance.css?v=css-phase2"];
  }
  if (localPath === "/proposals") {
    return [
      "/next/css/proposals-kits-performance.css?v=css-phase2",
      "/next/css/stocktaking-proposals-performance.css?v=css-phase2",
      "/next/css/proposals-after-stock-performance.css?v=css-phase2",
    ];
  }
  if (localPath === "/expenses" || localPath === "/expenses/users") {
    return ["/next/css/expenses-performance.css?v=css-phase2"];
  }
  if (localPath === "/b2c" || localPath.startsWith("/b2c/")) {
    return ["/next/css/b2c-performance.css?v=css-phase2"];
  }
  if (localPath === "/home") {
    return ["/next/css/home-performance.css?v=css-phase3"];
  }
  if (localPath === "/task-management" || localPath.startsWith("/task-management/")) {
    return ["/next/css/task-management-performance.css?v=css-phase3"];
  }
  if (localPath === "/events" || localPath.startsWith("/events/")
    || localPath === "/events-calendar" || localPath.startsWith("/events-calendar/")
    || localPath === "/event-components" || localPath.startsWith("/event-components/")) {
    return ["/next/css/events-performance.css?v=css-phase3"];
  }
  if (localPath === "/kpis" || localPath.startsWith("/kpis/")) {
    return ["/next/css/kpis-performance.css?v=css-phase3"];
  }
  if (localPath === "/users-center" || localPath.startsWith("/users-center/")) {
    return ["/next/css/users-center-performance.css?v=css-phase3"];
  }
  return [];
}

function routeDefaults(localPath) {
  const exact = {
    "/home": { title: "Home", activePath: "/next/home" },
    "/orders": { title: "Current Orders", activePath: "/next/orders" },
    "/orders-review": { title: "Orders Review", activePath: "/next/orders-review" },
    "/operations-orders": { title: "Operations Orders", activePath: "/next/operations-orders" },
    "/maintenance-orders": { title: "Maintenance Orders", activePath: "/next/maintenance-orders" },
    "/stocktaking": { title: "Stocktaking", activePath: "/next/stocktaking" },
    "/products": { title: "Products", activePath: "/next/products" },
    "/kits": { title: "Kits", activePath: "/next/kits" },
    "/proposals": { title: "Proposals", activePath: "/next/proposals" },
    "/expenses": { title: "Expenses", activePath: "/next/expenses" },
    "/expenses/users": { title: "Expenses by User", activePath: "/next/expenses/users" },
    "/kpis": { title: "KPIs", activePath: "/next/kpis" },
    "/users-center": { title: "Users Center", activePath: "/next/users-center" },
    "/history": { title: "History", activePath: "/next/history" },
    "/backup": { title: "Database", activePath: "/next/backup" },
    "/notifications": { title: "Notifications", activePath: "/next/notifications" },
    "/how-it-works": { title: "How it works", activePath: "/next/how-it-works" },
    "/account": { title: "User Profile", activePath: "/next/account" },
    "/app-install": { title: "Install Operations Hub", activePath: "/next/app-install" },
    "/events": { title: "Events", activePath: "/next/events" },
    "/events-calendar": { title: "Events", activePath: "/next/events-calendar" },
    "/event-components": { title: "Events", activePath: "/next/event-components" },
    "/events/new": { title: "New Event Request", activePath: "/next/events/new" },
    "/orders/new": { title: "Shopping Cart", activePath: "/next/orders/new" },
    "/b2c": { title: "B2C", activePath: "/next/b2c" },
    "/b2c/database": { title: "Database", activePath: "/next/b2c/database" },
    "/b2c/forms": { title: "Forms", activePath: "/next/b2c/forms" },
    "/task-management": { title: "Task Management", activePath: "/next/task-management" },
    "/migration-status": { title: "Home", activePath: "/next/migration-status" },
  };

  if (exact[localPath]) return exact[localPath];

  if (localPath.startsWith("/orders/new/request-products")) {
    return { title: "Request Products", activePath: "/next/orders/new/request-products" };
  }
  if (localPath.startsWith("/orders/new/withdraw-products")) {
    return { title: "Withdraw Products", activePath: "/next/orders/new/withdraw-products" };
  }
  if (localPath.startsWith("/orders/new/request-maintenance")) {
    return { title: "Request Maintenance", activePath: "/next/orders/new/request-maintenance" };
  }
  if (localPath.startsWith("/orders/tracking")) {
    return { title: "Order Tracking", activePath: "/next/orders" };
  }
  if (localPath.startsWith("/orders/receipt-viewer")) {
    return { title: "Order Receipts", activePath: "/next/expenses" };
  }
  if (localPath.startsWith("/task-management/")) {
    const view = localPath.split("/").filter(Boolean).at(-1) || "";
    const titles = {
      "all-tasks": "All Tasks",
      "my-tasks": "My Tasks",
      "delegated-tasks": "Delegated Tasks",
    };
    return { title: titles[view] || "Task Management", activePath: publicPathname(localPath) };
  }
  if (localPath.startsWith("/backup/")) {
    return { title: "Database Table", activePath: "/next/backup" };
  }
  if (localPath.startsWith("/b2c/database/")) {
    return { title: "B2C Table", activePath: publicPathname(localPath) };
  }

  return null;
}

export default function PersistentAppShell({ initialAccount = null, children }) {
  const rawPathname = usePathname();
  const localPath = localPathname(rawPathname);
  const defaults = useMemo(() => routeDefaults(localPath), [localPath]);
  const performanceStyles = useMemo(() => routePerformanceStyles(localPath), [localPath]);
  const [registered, setRegistered] = useState(null);
  const [cachedAccount, setCachedAccount] = useState(null);

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem("ops.ui.chrome.v1") || "null");
      if (cached && typeof cached === "object") {
        setCachedAccount((current) => ({ ...(current || {}), ...cached }));
      }
    } catch {}
  }, []);

  useLayoutEffect(() => {
    if (defaults) return;
    // BodyClassSync intentionally keeps the shared shell class alive between
    // authenticated routes. When navigation leaves the authenticated shell
    // entirely (login/PWA/public routes), explicitly clear those persistent
    // body markers so standalone pages retain their original geometry.
    document.body.classList.remove("persistent-app-shell", "next-classic-shell-active", "ops-has-system-cover");
  }, [defaults]);

  const registerPage = useCallback((config) => {
    const currentLocalPath = localPathname(window.location.pathname || "/");
    const nextValue = {
      path: currentLocalPath,
      account: config?.account || null,
      title: String(config?.title || "").trim(),
      activePath: String(config?.activePath || "").trim(),
    };
    setRegistered((previous) => {
      if (previous?.path === nextValue.path
        && previous?.account === nextValue.account
        && previous?.title === nextValue.title
        && previous?.activePath === nextValue.activePath) {
        return previous;
      }
      return nextValue;
    });
  }, []);

  // Routes without AppShell (login, PWA bootstrap/offline pages, redirect-only
  // indexes, and the public root) keep their original standalone rendering.
  if (!defaults) return children;

  const liveRegistration = registered?.path === localPath ? registered : null;
  const account = liveRegistration?.account || cachedAccount || initialAccount || null;
  const title = liveRegistration?.title || defaults.title;
  const activePath = liveRegistration?.activePath || defaults.activePath || publicPathname(localPath);

  return (
    <AppShell
      account={account}
      title={title}
      activePath={activePath}
      bodyClass="persistent-app-shell"
      pageStyles={performanceStyles}
    >
      <PersistentShellProvider registerPage={registerPage}>
        {children}
      </PersistentShellProvider>
    </AppShell>
  );
}
