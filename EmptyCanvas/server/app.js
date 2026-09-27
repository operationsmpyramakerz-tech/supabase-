"use strict";

const express = require("express");
const path = require("path");
const { createNextFrontendProxy } = require("./nextFrontendProxy");

const app = express();
const runtimeState = {
  startedAt: Date.now(),
  ready: !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME),
  draining: false,
};
app.locals.runtimeState = runtimeState;

app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader(
    "X-ERP-Worker",
    String(process.env.NODE_APP_INSTANCE ?? process.env.INSTANCE_ID ?? process.pid),
  );
  res.setHeader("X-ERP-Legacy-Mode", "compatibility-shell");
  next();
});

// Local/self-hosted compatibility: when the optional Next process is enabled,
// keep /next/* reachable through the old origin. Vercel production uses the
// separate Next deployment directly and does not depend on this proxy.
app.use(createNextFrontendProxy());

// Keep the legacy origin useful for already-installed PWAs/bookmarks during
// the final cutover. The same assets are also copied into next-frontend/public
// in Phase 46, so the Next deployment no longer depends on this static host.
app.use(
  express.static(path.join(__dirname, "..", "public"), {
    setHeaders(res, filePath) {
      if (filePath.endsWith("service-worker.js")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Service-Worker-Allowed", "/");
      }
      if (filePath.endsWith("manifest.webmanifest") || filePath.endsWith("manifest.json")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
      }
    },
  }),
);

function envTrue(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/.test(parsed.protocol)) return "";
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function publicNextOrigin() {
  // Prefer an explicit public origin. The fallback matches the production
  // Next project already used by the compatibility rewrites in this repo.
  return normalizeOrigin(
    process.env.NEXT_FRONTEND_PUBLIC_ORIGIN ||
      process.env.NEXT_FRONTEND_ORIGIN ||
      "https://operations-hub-next-pilot.vercel.app",
  );
}

function shouldUseRelativeNext() {
  return !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME && envTrue(process.env.ENABLE_NEXT_FRONTEND);
}

function targetUrl(nextPath, req) {
  const cleanPath = String(nextPath || "/next/login").startsWith("/")
    ? String(nextPath || "/next/login")
    : `/${String(nextPath || "next/login")}`;
  const incoming = new URL(String(req.originalUrl || req.url || "/"), "http://legacy.local");
  const target = new URL(cleanPath, "http://next.local");
  for (const [key, value] of incoming.searchParams.entries()) {
    if (!target.searchParams.has(key)) target.searchParams.append(key, value);
  }
  const relative = `${target.pathname}${target.search}`;
  if (shouldUseRelativeNext()) return relative;
  const origin = publicNextOrigin();
  return origin ? `${origin}${relative}` : relative;
}

function redirectNext(nextPath, status = 302) {
  return (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.redirect(status, targetUrl(nextPath, req));
  };
}

app.get("/health", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ok: true,
    service: "operations-hub-legacy-compatibility-shell",
    mode: "retirement-preparation",
    businessApis: 0,
    nextFrontendOrigin: publicNextOrigin() || null,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get("/ready", (req, res) => {
  const state = app.locals.runtimeState || runtimeState;
  const ready = state.ready !== false && state.draining !== true;
  res.setHeader("Cache-Control", "no-store");
  res.status(ready ? 200 : 503).json({
    ok: ready,
    ready,
    draining: !!state.draining,
    mode: "compatibility-shell",
    businessApis: 0,
    nextFrontendOrigin: publicNextOrigin() || null,
    timestamp: new Date().toISOString(),
  });
});

const SUPABASE_DIAGNOSTIC_PATHS = new Set([
  "/api/supabase/status",
  "/api/supabase/team-members-test",
  "/api/supabase/orders-test",
  "/api/supabase/orders-requested-test",
  "/api/supabase/orders-current-test",
  "/api/supabase/expenses-test",
  "/api/supabase/expenses-current-test",
  "/api/supabase/products-test",
  "/api/supabase/components-test",
  "/api/supabase/stocktaking-test",
  "/api/supabase/b2b-schools-test",
  "/api/supabase/storage-test",
]);

app.get(Array.from(SUPABASE_DIAGNOSTIC_PATHS), (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ok: true,
    retired: true,
    source: "legacy-compatibility-shell",
    message: "Supabase diagnostics moved to the Next.js deployment.",
    nextHealth: targetUrl("/next/api/health", req),
  });
});

// Preserve the one historical viewer URL that can still exist inside exported
// expense files or old bookmarks.
app.get("/orders/order-receipt-viewer", redirectNext("/next/orders/receipt-viewer"));

const LEGACY_PAGE_REDIRECTS = Object.freeze({
  "/": "/next/login",
  "/login": "/next/login",
  "/dashboard": "/next/home",
  "/home": "/next/home",
  "/user-access": "/next/users-center",
  "/orders": "/next/orders",
  "/orders/sv-orders": "/next/orders-review",
  "/orders/tracking": "/next/orders/tracking",
  "/orders/requested": "/next/operations-orders",
  "/orders/maintenance-orders": "/next/maintenance-orders",
  "/orders/new": "/next/orders/new",
  "/orders/new/products": "/next/orders/new",
  "/events": "/next/events",
  "/events/requests": "/next/events",
  "/events/calendar": "/next/events-calendar",
  "/events/new": "/next/events/new",
  "/events/components": "/next/event-components",
  "/events/components/new": "/next/event-components?create=1",
  "/b2c": "/next/b2c/database",
  "/b2c/database": "/next/b2c/database",
  "/b2c/form": "/next/b2c/forms",
  "/stocktaking": "/next/stocktaking",
  "/products": "/next/products",
  "/proposals": "/next/proposals",
  "/kits": "/next/kits",
  "/task-management": "/next/task-management/all-tasks",
  "/task-management/all-tasks": "/next/task-management/all-tasks",
  "/task-management/my-tasks": "/next/task-management/my-tasks",
  "/task-management/delegated-tasks": "/next/task-management/delegated-tasks",
  "/kpis": "/next/kpis",
  "/account": "/next/account",
  "/history": "/next/history",
  "/backup": "/next/backup",
  "/how-it-works": "/next/how-it-works",
  "/notifications": "/next/notifications",
  "/expenses": "/next/expenses",
  "/expenses/users": "/next/expenses/users",
  "/pwa-start": "/next/pwa-start",
  "/pwa-offline": "/next/pwa-offline",
});

const CLASSIC_HTML_REDIRECTS = Object.freeze({
  "/index.html": "/next/login",
  "/login.html": "/next/login",
  "/home.html": "/next/home",
  "/user-access.html": "/next/users-center",
  "/current-orders.html": "/next/orders",
  "/sv-orders.html": "/next/orders-review",
  "/requested-orders.html": "/next/operations-orders",
  "/maintenance-orders.html": "/next/maintenance-orders",
  "/create-order-products.html": "/next/orders/new",
  "/events.html": "/next/events",
  "/events-calendar.html": "/next/events-calendar",
  "/events-new.html": "/next/events/new",
  "/events-components.html": "/next/event-components",
  "/events-components-new.html": "/next/event-components?create=1",
  "/b2c-database.html": "/next/b2c/database",
  "/b2c-table.html": "/next/b2c/database",
  "/b2c-form.html": "/next/b2c/forms",
  "/stocktaking.html": "/next/stocktaking",
  "/products.html": "/next/products",
  "/proposals.html": "/next/proposals",
  "/kits.html": "/next/kits",
  "/task-management.html": "/next/task-management/all-tasks",
  "/kpis.html": "/next/kpis",
  "/account.html": "/next/account",
  "/history.html": "/next/history",
  "/backup.html": "/next/backup",
  "/how-it-works.html": "/next/how-it-works",
  "/notifications.html": "/next/notifications",
  "/expenses.html": "/next/expenses",
  "/expenses-users.html": "/next/expenses/users",
  "/pwa-start.html": "/next/pwa-start",
  "/pwa-offline.html": "/next/pwa-offline",
});

for (const [legacyPath, nextPath] of Object.entries({ ...LEGACY_PAGE_REDIRECTS, ...CLASSIC_HTML_REDIRECTS })) {
  app.get(legacyPath, redirectNext(nextPath));
}

app.get("/b2c/database/:id", (req, res) => {
  return redirectNext(`/next/b2c/database/${encodeURIComponent(String(req.params.id || ""))}`)(req, res);
});

// No business API is allowed to execute inside Express after Phase 46. Old
// Vercel rewrite rules still forward known compatibility URLs to Next before
// this handler. Anything that reaches this shell is stale and gets an explicit
// retirement response instead of silently reviving monolithic code.
app.all("/api/*", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(410).json({
    ok: false,
    code: "LEGACY_API_RETIRED",
    error: "This legacy API has been retired. Use the Next.js application.",
    nextApp: targetUrl("/next/home", req),
  });
});

app.use((req, res) => {
  if (req.method === "GET" || req.method === "HEAD") {
    return res.redirect(302, targetUrl("/next/login", req));
  }
  return res.status(404).json({ ok: false, error: "Not found." });
});

module.exports = app;
