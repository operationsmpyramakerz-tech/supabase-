"use strict";

const express = require("express");
const path = require("path");
const { createPageHtmlRenderer } = require("../pageHtmlRenderer");

function requireFunction(name, value) {
  if (typeof value !== "function") {
    throw new TypeError(`[pageRoutes] ${name} must be a function`);
  }
  return value;
}

/**
 * Creates the router responsible only for serving browser pages.
 *
 * Authentication and authorization middleware are injected from app.js so
 * this module remains independent from the current session/access storage.
 * That lets the remaining API routes be migrated incrementally without a
 * risky all-at-once rewrite.
 */
function createPageRouter(options = {}) {
  const {
    publicDir,
    requireAuth,
    requirePage,
    requireLmsPageAccess,
    userAccessPageAliases = [],
    eventsPreferredRoute,
    hasEventsComponentCreateAccess,
    b2cPreferredRoute,
    taskManagementPreferredRoute,
  } = options;

  const resolvedPublicDir = path.resolve(String(publicDir || ""));
  if (!publicDir || resolvedPublicDir === path.parse(resolvedPublicDir).root) {
    throw new TypeError("[pageRoutes] publicDir must point to the public directory");
  }

  const auth = requireFunction("requireAuth", requireAuth);
  const pageAccess = requireFunction("requirePage", requirePage);
  const lmsPageAccess = requireFunction("requireLmsPageAccess", requireLmsPageAccess);
  const preferredEventsRoute = requireFunction("eventsPreferredRoute", eventsPreferredRoute);
  const canCreateEventComponent = requireFunction(
    "hasEventsComponentCreateAccess",
    hasEventsComponentCreateAccess,
  );
  const preferredB2cRoute = requireFunction("b2cPreferredRoute", b2cPreferredRoute);
  const preferredTaskRoute = requireFunction(
    "taskManagementPreferredRoute",
    taskManagementPreferredRoute,
  );

  const router = express.Router();
  const pageHtmlRenderer = createPageHtmlRenderer({ publicDir: resolvedPublicDir });
  const sendPublicFile = (res, filename) => res.sendFile(path.join(resolvedPublicDir, filename));
  const sendAppPage = (req, res, filename) => pageHtmlRenderer.render(req, res, filename);
  const disableBrowserCache = (res) => {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  };

  function envEnabled(value) {
    return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
  }

  function nextFrontendEnabled() {
    return envEnabled(process.env.ENABLE_NEXT_FRONTEND);
  }

  // Once all browser workspaces have a Next.js replacement, the classic URLs
  // can become compatibility entry points. The cutover follows
  // ENABLE_NEXT_FRONTEND by default, but can be rolled back independently by
  // setting ENABLE_NEXT_ROUTE_CUTOVER=false in the legacy ERP deployment.
  function nextRouteCutoverEnabled() {
    const configured = String(process.env.ENABLE_NEXT_ROUTE_CUTOVER || "").trim();
    if (!configured) return nextFrontendEnabled();
    return envEnabled(configured);
  }

  function originalQueryParams(req) {
    const original = String(req.originalUrl || "");
    const index = original.indexOf("?");
    if (index < 0) return new URLSearchParams();
    return new URLSearchParams(original.slice(index + 1));
  }

  function loginQuerySuffix(req) {
    const original = String(req.originalUrl || "");
    const index = original.indexOf("?");
    return index >= 0 ? original.slice(index) : "";
  }

  function wantsClassicPage(req) {
    return envEnabled(req.query?.classic);
  }

  // Keep the old helper name for the public Login/PWA entry points.
  function wantsClassicLogin(req) {
    return wantsClassicPage(req);
  }

  function sameOriginReferrer(req) {
    const raw = String(req.get("referer") || req.get("referrer") || "").trim();
    if (!raw) return null;
    try {
      const base = `${req.protocol || "https"}://${req.get("host") || "localhost"}`;
      const url = new URL(raw, base);
      if (url.host && req.get("host") && url.host !== req.get("host")) return null;
      return url;
    } catch {
      return null;
    }
  }

  function cameFromNextInterface(req) {
    const referrer = sameOriginReferrer(req);
    if (!referrer) return false;
    return referrer.pathname === "/next" || referrer.pathname.startsWith("/next/");
  }

  function cameFromClassicFallback(req) {
    const referrer = sameOriginReferrer(req);
    return !!referrer && envEnabled(referrer.searchParams.get("classic"));
  }

  function classicRequestUrl(req) {
    const params = originalQueryParams(req);
    params.set("classic", "1");
    const query = params.toString();
    return `${req.path || "/"}${query ? `?${query}` : ""}`;
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

  function classicRedirectTarget(req, target) {
    const url = new URL(String(target || "/home"), "http://operations-hub.local");
    const incoming = originalQueryParams(req);
    incoming.delete("classic");
    for (const [key, value] of incoming.entries()) {
      if (!url.searchParams.has(key)) url.searchParams.append(key, value);
    }
    if (nextRouteCutoverEnabled() || wantsClassicPage(req)) url.searchParams.set("classic", "1");
    const queryString = url.searchParams.toString();
    return `${url.pathname}${queryString ? `?${queryString}` : ""}`;
  }

  /**
   * Redirect a migrated classic URL to its Next.js replacement.
   *
   * `?classic=1` is the durable escape hatch. Existing "Open classic" links
   * in the Next.js pilot also keep working during the cutover: a request that
   * originated from /next is normalized to the same URL with ?classic=1.
   */
  function maybeRedirectMigratedRoute(req, res, target, options = {}) {
    if (!nextRouteCutoverEnabled()) return false;
    if (wantsClassicPage(req)) return false;

    if (cameFromNextInterface(req) || cameFromClassicFallback(req)) {
      res.redirect(classicRequestUrl(req));
      return true;
    }

    res.redirect(mergedTargetUrl(req, target, options));
    return true;
  }

  function serveMigratedPage(req, res, target, filename, options = {}) {
    if (maybeRedirectMigratedRoute(req, res, target, options)) return undefined;
    return sendAppPage(req, res, filename);
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

  // Public PWA entry points must remain before all authenticated page routes.
  router.get("/pwa-start", (req, res) => {
    disableBrowserCache(res);
    if (nextFrontendEnabled() && !wantsClassicLogin(req)) return res.redirect("/next/pwa-start");
    return sendPublicFile(res, "pwa-start.html");
  });

  router.get("/pwa-offline", (req, res) => {
    disableBrowserCache(res);
    if (nextFrontendEnabled() && !wantsClassicLogin(req)) return res.redirect("/next/pwa-offline");
    return sendPublicFile(res, "pwa-offline.html");
  });

  router.get("/manifest.json", (req, res) => {
    disableBrowserCache(res);
    res.type("application/manifest+json");
    return sendPublicFile(res, "manifest.json");
  });

  router.get("/login", (req, res) => {
    if (req.session?.authenticated) return res.redirect(nextFrontendEnabled() ? "/next/home" : "/home");
    if (nextFrontendEnabled() && !wantsClassicLogin(req)) {
      return res.redirect(`/next/login${loginQuerySuffix(req)}`);
    }
    return sendPublicFile(res, "login.html");
  });

  router.get("/", (req, res) => {
    if (req.session?.authenticated) return res.redirect(nextFrontendEnabled() ? "/next/home" : "/home");
    if (nextFrontendEnabled()) return res.redirect("/next/login");
    return sendPublicFile(res, "login.html");
  });

  router.get("/dashboard", auth, (req, res) => {
    if (maybeRedirectMigratedRoute(req, res, "/next/home")) return;
    return res.redirect(wantsClassicPage(req) ? "/home?classic=1" : "/home");
  });

  router.get("/home", auth, (req, res) =>
    serveMigratedPage(req, res, "/next/home", "home.html"),
  );

  router.get("/lms", auth, (req, res) =>
    serveMigratedPage(req, res, "/next/lms", "lms.html"),
  );

  router.get("/user-access", auth, pageAccess(userAccessPageAliases), (req, res) =>
    serveMigratedPage(req, res, "/next/users-center", "user-access.html"),
  );

  router.get("/lms/user-access", auth, lmsPageAccess("lms-users-center"), (req, res) =>
    serveMigratedPage(req, res, "/next/lms/users-center", "lms-user-access.html"),
  );

  router.get(
    "/lms/user-access/:role(supervisors|team-leaders|instructors|co-instructors|school-coordinators|students|parents)",
    auth,
    lmsPageAccess("lms-users-center"),
    (req, res) => serveMigratedPage(
      req,
      res,
      "/next/lms/users-center",
      "lms-role-directory.html",
      { query: { tab: req.params.role } },
    ),
  );

  router.get(
    ["/lms/curriculum", "/lms/curriculum/:id", "/lms/curriculum/:id/grade/:gradeId"],
    auth,
    lmsPageAccess("lms-curriculum"),
    (req, res) => serveMigratedPage(
      req,
      res,
      "/next/lms/curriculum",
      "lms-curriculum.html",
      { query: { theme: req.params.id, grade: req.params.gradeId } },
    ),
  );

  router.get("/orders", auth, pageAccess("Current Orders"), (req, res) =>
    serveMigratedPage(req, res, "/next/orders", "current-orders.html"),
  );

  // Orders Review was historically registered late in app.js, outside this
  // browser-page router. Keep it here with the rest of the migrated pages so
  // the production cutover and ?classic=1 rollback behave consistently.
  router.get("/orders/sv-orders", auth, pageAccess("Orders Review"), (req, res) =>
    serveMigratedPage(req, res, "/next/orders-review", "sv-orders.html"),
  );

  router.get("/orders/tracking", auth, pageAccess("Current Orders"), (req, res) => {
    // The legacy repository no longer contains order-tracking.html. Keep old
    // bookmarks valid by routing them to the migrated tracker whenever the
    // Next.js frontend is enabled, even if ?classic=1 was appended manually.
    if (nextFrontendEnabled()) return res.redirect(mergedTargetUrl(req, "/next/orders/tracking"));
    return res.redirect("/orders");
  });

  router.get("/orders/requested", auth, pageAccess("Requested Orders"), (req, res) =>
    serveMigratedPage(req, res, "/next/operations-orders", "requested-orders.html"),
  );

  router.get(
    "/orders/maintenance-orders",
    auth,
    pageAccess("Maintenance Orders"),
    (req, res) => serveMigratedPage(req, res, "/next/maintenance-orders", "maintenance-orders.html"),
  );

  router.get("/orders/new", auth, pageAccess("Create New Order"), (req, res) => {
    if (maybeRedirectMigratedRoute(req, res, "/next/orders/new")) return;
    return res.redirect(classicRedirectTarget(req, "/orders/new/products"));
  });

  router.get(
    "/orders/new/products",
    auth,
    pageAccess("Create New Order"),
    (req, res) => serveMigratedPage(req, res, "/next/orders/new", "create-order-products.html"),
  );

  router.get(
    "/events",
    auth,
    pageAccess(["Event Calendar", "Event Requests", "Event Components"]),
    (req, res) => {
      if (maybeRedirectMigratedRoute(req, res, nextEventsTarget(req))) return;
      return res.redirect(classicRedirectTarget(req, preferredEventsRoute(req)));
    },
  );

  router.get("/events/requests", auth, pageAccess("Event Requests"), (req, res) =>
    serveMigratedPage(req, res, "/next/events", "events.html"),
  );

  router.get("/events/calendar", auth, pageAccess("Event Calendar"), (req, res) =>
    serveMigratedPage(req, res, "/next/events-calendar", "events-calendar.html"),
  );

  router.get("/events/new", auth, pageAccess("Event Requests"), (req, res) =>
    serveMigratedPage(req, res, "/next/events/new", "events-new.html"),
  );

  router.get(
    "/events/components/new",
    auth,
    pageAccess("Event Components"),
    (req, res) => {
      // The Next.js catalogue can request the Admin authorization in-place,
      // so an old deep link can open the create flow even before the unlock
      // has been granted. The create API still enforces the same authorization.
      if (maybeRedirectMigratedRoute(req, res, "/next/event-components", { query: { create: "1" } })) return;
      if (!canCreateEventComponent(req)) {
        return res.redirect(classicRedirectTarget(req, "/events/components?adminAuthorization=required"));
      }
      return sendAppPage(req, res, "events-components-new.html");
    },
  );

  router.get("/events/components", auth, pageAccess("Event Components"), (req, res) =>
    serveMigratedPage(req, res, "/next/event-components", "events-components.html"),
  );

  router.get(
    "/b2c",
    auth,
    pageAccess(["Customer Database", "Customer Form", "B2C"]),
    (req, res) => {
      if (maybeRedirectMigratedRoute(req, res, nextB2cTarget(req))) return;
      return res.redirect(classicRedirectTarget(req, preferredB2cRoute(req)));
    },
  );

  router.get("/b2c/database", auth, pageAccess("Customer Database"), (req, res) =>
    serveMigratedPage(req, res, "/next/b2c/database", "b2c-database.html"),
  );

  router.get("/b2c/database/:id", auth, pageAccess("Customer Database"), (req, res) =>
    serveMigratedPage(req, res, `/next/b2c/database/${encodeURIComponent(req.params.id)}`, "b2c-table.html"),
  );

  router.get("/b2c/form", auth, pageAccess("Customer Form"), (req, res) =>
    serveMigratedPage(req, res, "/next/b2c/forms", "b2c-form.html"),
  );

  router.get("/stocktaking", auth, pageAccess("Stocktaking"), (req, res) =>
    serveMigratedPage(req, res, "/next/stocktaking", "stocktaking.html"),
  );

  router.get("/products", auth, pageAccess("Products"), (req, res) =>
    serveMigratedPage(req, res, "/next/products", "products.html"),
  );

  router.get("/proposals", auth, pageAccess(["Proposals", "Products"]), (req, res) =>
    serveMigratedPage(req, res, "/next/proposals", "proposals.html"),
  );

  router.get("/kits", auth, pageAccess(["Kits", "Products"]), (req, res) =>
    serveMigratedPage(req, res, "/next/kits", "kits.html"),
  );

  router.get(
    "/task-management",
    auth,
    pageAccess(["All Tasks", "My Tasks", "Delegated Tasks", "Task Management"]),
    (req, res) => {
      if (maybeRedirectMigratedRoute(req, res, nextTaskTarget(req))) return;
      return res.redirect(classicRedirectTarget(req, preferredTaskRoute(req)));
    },
  );

  router.get("/task-management/all-tasks", auth, pageAccess("All Tasks"), (req, res) =>
    serveMigratedPage(req, res, "/next/task-management/all-tasks", "task-management.html"),
  );

  router.get("/task-management/my-tasks", auth, pageAccess("My Tasks"), (req, res) =>
    serveMigratedPage(req, res, "/next/task-management/my-tasks", "task-management.html"),
  );

  router.get(
    "/task-management/delegated-tasks",
    auth,
    pageAccess("Delegated Tasks"),
    (req, res) => serveMigratedPage(req, res, "/next/task-management/delegated-tasks", "task-management.html"),
  );

  router.get("/kpis", auth, pageAccess("KPIs"), (req, res) =>
    serveMigratedPage(req, res, "/next/kpis", "kpis.html"),
  );

  router.get(
    ["/lms/b2b", "/lms/b2b/new", "/lms/b2b/edit/:id"],
    auth,
    lmsPageAccess("lms-b2b"),
    (req, res) => {
      const query = req.path === "/lms/b2b/new"
        ? { action: "new" }
        : req.params.id
          ? { edit: req.params.id }
          : {};
      return serveMigratedPage(req, res, "/next/lms/schools", "lms-b2b.html", { query });
    },
  );

  router.get("/lms/b2b/school/:id", auth, lmsPageAccess("lms-b2b"), (req, res) =>
    serveMigratedPage(req, res, `/next/lms/schools/${encodeURIComponent(req.params.id)}`, "lms-b2b-school.html"),
  );

  // Preserve legacy B2B bookmarks after moving the module into LMS. During the
  // Next.js cutover they land directly in the migrated LMS Schools workspace.
  router.get(["/b2b", "/b2b/new", "/b2b/edit/:id"], auth, (req, res) => {
    const query = req.path === "/b2b/new"
      ? { action: "new" }
      : req.params.id
        ? { edit: req.params.id }
        : {};
    if (maybeRedirectMigratedRoute(req, res, "/next/lms/schools", { query })) return;
    const suffix = req.path.replace(/^\/b2b/, "");
    return res.redirect(classicRedirectTarget(req, `/lms/b2b${suffix}`));
  });

  router.get("/b2b/school/:id", auth, (req, res) => {
    if (maybeRedirectMigratedRoute(req, res, `/next/lms/schools/${encodeURIComponent(req.params.id)}`)) return;
    return res.redirect(classicRedirectTarget(req, `/lms/b2b/school/${encodeURIComponent(req.params.id)}`));
  });

  router.get("/account", auth, (req, res) =>
    serveMigratedPage(req, res, "/next/account", "account.html"),
  );

  router.get("/history", auth, pageAccess("History"), (req, res) =>
    serveMigratedPage(req, res, "/next/history", "history.html"),
  );

  router.get("/backup", auth, pageAccess("Backup"), (req, res) =>
    serveMigratedPage(req, res, "/next/backup", "backup.html"),
  );

  router.get("/how-it-works", auth, (req, res) =>
    serveMigratedPage(req, res, "/next/how-it-works", "how-it-works.html"),
  );

  router.get("/notifications", auth, (req, res) => {
    if (maybeRedirectMigratedRoute(req, res, "/next/notifications")) return;
    return res.redirect(classicRedirectTarget(req, "/home"));
  });

  router.get("/expenses", auth, pageAccess("Expenses"), (req, res) =>
    serveMigratedPage(req, res, "/next/expenses", "expenses.html"),
  );

  router.get("/expenses/users", auth, pageAccess("Expenses Users"), (req, res) =>
    serveMigratedPage(req, res, "/next/expenses/users", "expenses-users.html"),
  );

  return router;
}

module.exports = { createPageRouter };
