"use strict";

const express = require("express");
const path = require("path");

function requireFunction(name, value) {
  if (typeof value !== "function") {
    throw new TypeError(`[pageRoutes] ${name} must be a function`);
  }
  return value;
}

/**
 * Browser-page compatibility router.
 *
 * The Classic HTML frontend has been retired. Historical browser URLs are kept
 * only as authenticated/authorized compatibility entry points that redirect to
 * the corresponding Next.js workspace. API routes and shared public assets stay
 * on the Express application until their later migration phases.
 */
function createPageRouter(options = {}) {
  const {
    publicDir,
    requireAuth,
    requirePage,
    userAccessPageAliases = [],
    eventsPreferredRoute,
    b2cPreferredRoute,
    taskManagementPreferredRoute,
  } = options;

  const resolvedPublicDir = path.resolve(String(publicDir || ""));
  if (!publicDir || resolvedPublicDir === path.parse(resolvedPublicDir).root) {
    throw new TypeError("[pageRoutes] publicDir must point to the public directory");
  }

  const auth = requireFunction("requireAuth", requireAuth);
  const pageAccess = requireFunction("requirePage", requirePage);
  const preferredEventsRoute = requireFunction("eventsPreferredRoute", eventsPreferredRoute);
  const preferredB2cRoute = requireFunction("b2cPreferredRoute", b2cPreferredRoute);
  const preferredTaskRoute = requireFunction(
    "taskManagementPreferredRoute",
    taskManagementPreferredRoute,
  );

  const router = express.Router();
  const sendPublicFile = (res, filename) => res.sendFile(path.join(resolvedPublicDir, filename));
  const disableBrowserCache = (res) => {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  };

  function originalQueryParams(req) {
    const original = String(req.originalUrl || "");
    const index = original.indexOf("?");
    if (index < 0) return new URLSearchParams();
    return new URLSearchParams(original.slice(index + 1));
  }

  function mergedTargetUrl(req, target, { preserveQuery = true, query = {} } = {}) {
    const url = new URL(String(target || "/next/home"), "http://operations-hub.local");
    const fixedKeys = new Set(Array.from(url.searchParams.keys()));

    if (preserveQuery) {
      const incoming = originalQueryParams(req);
      incoming.delete("classic");
      for (const [key, value] of incoming.entries()) {
        if (!fixedKeys.has(key)) url.searchParams.append(key, value);
      }
    }

    for (const [key, value] of Object.entries(query || {})) {
      const clean = String(value ?? "").trim();
      if (clean) url.searchParams.set(key, clean);
      else url.searchParams.delete(key);
    }

    const queryString = url.searchParams.toString();
    return `${url.pathname}${queryString ? `?${queryString}` : ""}${url.hash || ""}`;
  }

  function redirectNext(req, res, target, options = {}) {
    return res.redirect(302, mergedTargetUrl(req, target, options));
  }

  function nextEventsTarget(req) {
    const route = String(preferredEventsRoute(req) || "");
    if (route.startsWith("/events/calendar")) return "/next/events-calendar";
    if (route.startsWith("/events/components")) return "/next/event-components";
    return "/next/events";
  }

  function nextB2cTarget(req) {
    const route = String(preferredB2cRoute(req) || "");
    if (route.startsWith("/b2c/form")) return "/next/b2c/forms";
    return "/next/b2c/database";
  }

  function nextTaskTarget(req) {
    const route = String(preferredTaskRoute(req) || "");
    if (route.includes("/my-tasks")) return "/next/task-management/my-tasks";
    if (route.includes("/delegated-tasks")) return "/next/task-management/delegated-tasks";
    return "/next/task-management/all-tasks";
  }

  // Public PWA compatibility entry points now always use the Next frontend.
  router.get("/pwa-start", (req, res) => {
    disableBrowserCache(res);
    return redirectNext(req, res, "/next/pwa-start");
  });

  router.get("/pwa-offline", (req, res) => {
    disableBrowserCache(res);
    return redirectNext(req, res, "/next/pwa-offline");
  });

  router.get("/manifest.json", (req, res) => {
    disableBrowserCache(res);
    res.type("application/manifest+json");
    return sendPublicFile(res, "manifest.json");
  });

  router.get("/login", (req, res) => {
    if (req.session?.authenticated) return redirectNext(req, res, "/next/home");
    return redirectNext(req, res, "/next/login");
  });

  router.get("/", (req, res) => {
    if (req.session?.authenticated) return redirectNext(req, res, "/next/home");
    return redirectNext(req, res, "/next/login");
  });

  router.get("/dashboard", auth, (req, res) => redirectNext(req, res, "/next/home"));
  router.get("/home", auth, (req, res) => redirectNext(req, res, "/next/home"));
  router.get("/user-access", auth, pageAccess(userAccessPageAliases), (req, res) =>
    redirectNext(req, res, "/next/users-center"),
  );

  router.get("/orders", auth, pageAccess("Current Orders"), (req, res) =>
    redirectNext(req, res, "/next/orders"),
  );
  router.get("/orders/sv-orders", auth, pageAccess("Orders Review"), (req, res) =>
    redirectNext(req, res, "/next/orders-review"),
  );
  router.get("/orders/tracking", auth, pageAccess("Current Orders"), (req, res) =>
    redirectNext(req, res, "/next/orders/tracking"),
  );
  router.get("/orders/requested", auth, pageAccess("Requested Orders"), (req, res) =>
    redirectNext(req, res, "/next/operations-orders"),
  );
  router.get(
    "/orders/maintenance-orders",
    auth,
    pageAccess("Maintenance Orders"),
    (req, res) => redirectNext(req, res, "/next/maintenance-orders"),
  );
  router.get("/orders/new", auth, pageAccess("Create New Order"), (req, res) =>
    redirectNext(req, res, "/next/orders/new"),
  );
  router.get("/orders/new/products", auth, pageAccess("Create New Order"), (req, res) =>
    redirectNext(req, res, "/next/orders/new"),
  );

  router.get(
    "/events",
    auth,
    pageAccess(["Event Calendar", "Event Requests", "Event Components"]),
    (req, res) => redirectNext(req, res, nextEventsTarget(req)),
  );
  router.get("/events/requests", auth, pageAccess("Event Requests"), (req, res) =>
    redirectNext(req, res, "/next/events"),
  );
  router.get("/events/calendar", auth, pageAccess("Event Calendar"), (req, res) =>
    redirectNext(req, res, "/next/events-calendar"),
  );
  router.get("/events/new", auth, pageAccess("Event Requests"), (req, res) =>
    redirectNext(req, res, "/next/events/new"),
  );
  router.get("/events/components/new", auth, pageAccess("Event Components"), (req, res) =>
    redirectNext(req, res, "/next/event-components", { query: { create: "1" } }),
  );
  router.get("/events/components", auth, pageAccess("Event Components"), (req, res) =>
    redirectNext(req, res, "/next/event-components"),
  );

  router.get(
    "/b2c",
    auth,
    pageAccess(["Customer Database", "Customer Form", "B2C"]),
    (req, res) => redirectNext(req, res, nextB2cTarget(req)),
  );
  router.get("/b2c/database", auth, pageAccess("Customer Database"), (req, res) =>
    redirectNext(req, res, "/next/b2c/database"),
  );
  router.get("/b2c/database/:id", auth, pageAccess("Customer Database"), (req, res) =>
    redirectNext(req, res, `/next/b2c/database/${encodeURIComponent(req.params.id)}`),
  );
  router.get("/b2c/form", auth, pageAccess("Customer Form"), (req, res) =>
    redirectNext(req, res, "/next/b2c/forms"),
  );

  router.get("/stocktaking", auth, pageAccess("Stocktaking"), (req, res) =>
    redirectNext(req, res, "/next/stocktaking"),
  );
  router.get("/products", auth, pageAccess("Products"), (req, res) =>
    redirectNext(req, res, "/next/products"),
  );
  router.get("/proposals", auth, pageAccess(["Proposals", "Products"]), (req, res) =>
    redirectNext(req, res, "/next/proposals"),
  );
  router.get("/kits", auth, pageAccess(["Kits", "Products"]), (req, res) =>
    redirectNext(req, res, "/next/kits"),
  );

  router.get(
    "/task-management",
    auth,
    pageAccess(["All Tasks", "My Tasks", "Delegated Tasks", "Task Management"]),
    (req, res) => redirectNext(req, res, nextTaskTarget(req)),
  );
  router.get("/task-management/all-tasks", auth, pageAccess("All Tasks"), (req, res) =>
    redirectNext(req, res, "/next/task-management/all-tasks"),
  );
  router.get("/task-management/my-tasks", auth, pageAccess("My Tasks"), (req, res) =>
    redirectNext(req, res, "/next/task-management/my-tasks"),
  );
  router.get(
    "/task-management/delegated-tasks",
    auth,
    pageAccess("Delegated Tasks"),
    (req, res) => redirectNext(req, res, "/next/task-management/delegated-tasks"),
  );

  router.get("/kpis", auth, pageAccess("KPIs"), (req, res) =>
    redirectNext(req, res, "/next/kpis"),
  );

  router.get("/account", auth, (req, res) => redirectNext(req, res, "/next/account"));
  router.get("/history", auth, pageAccess("History"), (req, res) =>
    redirectNext(req, res, "/next/history"),
  );
  router.get("/backup", auth, pageAccess("Backup"), (req, res) =>
    redirectNext(req, res, "/next/backup"),
  );
  router.get("/how-it-works", auth, (req, res) =>
    redirectNext(req, res, "/next/how-it-works"),
  );
  router.get("/notifications", auth, (req, res) =>
    redirectNext(req, res, "/next/notifications"),
  );
  router.get("/expenses", auth, pageAccess("Expenses"), (req, res) =>
    redirectNext(req, res, "/next/expenses"),
  );
  router.get("/expenses/users", auth, pageAccess("Expenses Users"), (req, res) =>
    redirectNext(req, res, "/next/expenses/users"),
  );

  return router;
}

module.exports = { createPageRouter };
