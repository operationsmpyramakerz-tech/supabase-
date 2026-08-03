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
  const sendPublicFile = (res, filename) => res.sendFile(path.join(resolvedPublicDir, filename));
  const disableBrowserCache = (res) => {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  };

  // Public PWA entry points must remain before all authenticated page routes.
  router.get("/pwa-start", (req, res) => {
    disableBrowserCache(res);
    return sendPublicFile(res, "pwa-start.html");
  });

  router.get("/pwa-offline", (req, res) => {
    disableBrowserCache(res);
    return sendPublicFile(res, "pwa-offline.html");
  });

  router.get("/manifest.json", (req, res) => {
    disableBrowserCache(res);
    res.type("application/manifest+json");
    return sendPublicFile(res, "manifest.json");
  });

  router.get("/login", (req, res) => {
    if (req.session?.authenticated) return res.redirect("/home");
    return sendPublicFile(res, "login.html");
  });

  router.get("/", (req, res) => {
    if (req.session?.authenticated) return res.redirect("/home");
    return sendPublicFile(res, "login.html");
  });

  router.get("/dashboard", auth, (req, res) => res.redirect("/home"));
  router.get("/home", auth, (req, res) => sendPublicFile(res, "home.html"));
  router.get("/lms", auth, (req, res) => sendPublicFile(res, "lms.html"));

  router.get("/user-access", auth, pageAccess(userAccessPageAliases), (req, res) =>
    sendPublicFile(res, "user-access.html"),
  );

  router.get("/lms/user-access", auth, lmsPageAccess("lms-users-center"), (req, res) =>
    sendPublicFile(res, "lms-user-access.html"),
  );

  router.get(
    "/lms/user-access/:role(supervisors|team-leaders|instructors|co-instructors|school-coordinators|students|parents)",
    auth,
    lmsPageAccess("lms-users-center"),
    (req, res) => sendPublicFile(res, "lms-role-directory.html"),
  );

  router.get(
    ["/lms/curriculum", "/lms/curriculum/:id", "/lms/curriculum/:id/grade/:gradeId"],
    auth,
    lmsPageAccess("lms-curriculum"),
    (req, res) => sendPublicFile(res, "lms-curriculum.html"),
  );

  router.get("/orders", auth, pageAccess("Current Orders"), (req, res) =>
    sendPublicFile(res, "current-orders.html"),
  );

  router.get("/orders/tracking", auth, pageAccess("Current Orders"), (req, res) =>
    sendPublicFile(res, "order-tracking.html"),
  );

  router.get("/orders/requested", auth, pageAccess("Requested Orders"), (req, res) =>
    sendPublicFile(res, "requested-orders.html"),
  );

  router.get(
    "/orders/maintenance-orders",
    auth,
    pageAccess("Maintenance Orders"),
    (req, res) => sendPublicFile(res, "maintenance-orders.html"),
  );

  router.get("/orders/new", auth, pageAccess("Create New Order"), (req, res) => {
    const queryIndex = String(req.originalUrl || "").indexOf("?");
    const query = queryIndex >= 0 ? String(req.originalUrl || "").slice(queryIndex) : "";
    return res.redirect(`/orders/new/products${query}`);
  });

  router.get(
    "/orders/new/products",
    auth,
    pageAccess("Create New Order"),
    (req, res) => sendPublicFile(res, "create-order-products.html"),
  );

  router.get(
    "/events",
    auth,
    pageAccess(["Event Calendar", "Event Requests", "Event Components"]),
    (req, res) => res.redirect(preferredEventsRoute(req)),
  );

  router.get("/events/requests", auth, pageAccess("Event Requests"), (req, res) =>
    sendPublicFile(res, "events.html"),
  );

  router.get("/events/calendar", auth, pageAccess("Event Calendar"), (req, res) =>
    sendPublicFile(res, "events-calendar.html"),
  );

  router.get("/events/new", auth, pageAccess("Event Requests"), (req, res) =>
    sendPublicFile(res, "events-new.html"),
  );

  router.get(
    "/events/components/new",
    auth,
    pageAccess("Event Components"),
    (req, res) => {
      if (!canCreateEventComponent(req)) {
        return res.redirect("/events/components?adminAuthorization=required");
      }
      return sendPublicFile(res, "events-components-new.html");
    },
  );

  router.get("/events/components", auth, pageAccess("Event Components"), (req, res) =>
    sendPublicFile(res, "events-components.html"),
  );

  router.get(
    "/b2c",
    auth,
    pageAccess(["Customer Database", "Customer Form", "B2C"]),
    (req, res) => res.redirect(preferredB2cRoute(req)),
  );

  router.get("/b2c/database", auth, pageAccess("Customer Database"), (req, res) =>
    sendPublicFile(res, "b2c-database.html"),
  );

  router.get("/b2c/database/:id", auth, pageAccess("Customer Database"), (req, res) =>
    sendPublicFile(res, "b2c-table.html"),
  );

  router.get("/b2c/form", auth, pageAccess("Customer Form"), (req, res) =>
    sendPublicFile(res, "b2c-form.html"),
  );

  router.get("/stocktaking", auth, pageAccess("Stocktaking"), (req, res) =>
    sendPublicFile(res, "stocktaking.html"),
  );

  router.get("/products", auth, pageAccess("Products"), (req, res) =>
    sendPublicFile(res, "products.html"),
  );

  router.get("/proposals", auth, pageAccess(["Proposals", "Products"]), (req, res) =>
    sendPublicFile(res, "proposals.html"),
  );

  router.get("/kits", auth, pageAccess(["Kits", "Products"]), (req, res) =>
    sendPublicFile(res, "kits.html"),
  );

  router.get(
    "/task-management",
    auth,
    pageAccess(["All Tasks", "My Tasks", "Delegated Tasks", "Task Management"]),
    (req, res) => res.redirect(preferredTaskRoute(req)),
  );

  router.get("/task-management/all-tasks", auth, pageAccess("All Tasks"), (req, res) =>
    sendPublicFile(res, "task-management.html"),
  );

  router.get("/task-management/my-tasks", auth, pageAccess("My Tasks"), (req, res) =>
    sendPublicFile(res, "task-management.html"),
  );

  router.get(
    "/task-management/delegated-tasks",
    auth,
    pageAccess("Delegated Tasks"),
    (req, res) => sendPublicFile(res, "task-management.html"),
  );

  router.get("/kpis", auth, pageAccess("KPIs"), (req, res) =>
    sendPublicFile(res, "kpis.html"),
  );

  router.get(
    ["/lms/b2b", "/lms/b2b/new", "/lms/b2b/edit/:id"],
    auth,
    lmsPageAccess("lms-b2b"),
    (req, res) => sendPublicFile(res, "lms-b2b.html"),
  );

  router.get("/lms/b2b/school/:id", auth, lmsPageAccess("lms-b2b"), (req, res) =>
    sendPublicFile(res, "lms-b2b-school.html"),
  );

  // Preserve legacy B2B bookmarks after moving the module into LMS.
  router.get(["/b2b", "/b2b/new", "/b2b/edit/:id"], auth, (req, res) => {
    const suffix = req.path.replace(/^\/b2b/, "");
    return res.redirect(`/lms/b2b${suffix}`);
  });

  router.get("/b2b/school/:id", auth, (req, res) =>
    res.redirect(`/lms/b2b/school/${encodeURIComponent(req.params.id)}`),
  );

  router.get("/account", auth, (req, res) => sendPublicFile(res, "account.html"));
  router.get("/history", auth, pageAccess("History"), (req, res) =>
    sendPublicFile(res, "history.html"),
  );
  router.get("/backup", auth, pageAccess("Backup"), (req, res) =>
    sendPublicFile(res, "backup.html"),
  );
  router.get("/how-it-works", auth, (req, res) => sendPublicFile(res, "how-it-works.html"));
  router.get("/notifications", auth, (req, res) => res.redirect("/home"));
  router.get("/expenses", auth, pageAccess("Expenses"), (req, res) =>
    sendPublicFile(res, "expenses.html"),
  );
  router.get("/expenses/users", auth, pageAccess("Expenses Users"), (req, res) =>
    sendPublicFile(res, "expenses-users.html"),
  );

  return router;
}

module.exports = { createPageRouter };
