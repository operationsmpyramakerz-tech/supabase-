"use strict";

const fs = require("fs");
const path = require("path");

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function normalizeString(value, max = 2000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function normalizeStringList(values, maxItems = 500) {
  const source = Array.isArray(values) ? values : [];
  const seen = new Set();
  const out = [];
  for (const value of source) {
    const clean = normalizeString(value, 500);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

function accessToken(value) {
  return String(value == null ? "" : value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function buildVisibleRoutes(account, req) {
  const tokens = new Set();
  const add = (value) => {
    const token = accessToken(value);
    if (token) tokens.add(token);
  };

  for (const value of Array.isArray(account?.allowedPages) ? account.allowedPages : []) add(value);
  for (const row of Array.isArray(account?.pageAccess?.pages) ? account.pageAccess.pages : []) {
    if (row?.isEnabled === false) continue;
    [row?.pageId, row?.pageKey, row?.pageName, row?.routePath, ...(Array.isArray(row?.aliases) ? row.aliases : [])].forEach(add);
  }

  const has = (...values) => values.some((value) => tokens.has(accessToken(value)));
  const visible = new Set(["/home", "/lms"]);
  const rules = [
    ["/orders", ["Current Orders", "/orders"]],
    ["/orders/requested", ["Requested Orders", "Schools Requested Orders", "/orders/requested"]],
    ["/orders/maintenance-orders", ["Maintenance Orders", "/orders/maintenance-orders"]],
    ["/orders/new", ["Create New Order", "Shopping Cart", "Cart", "/orders/new"]],
    ["/stocktaking", ["Stocktaking", "/stocktaking"]],
    ["/orders/sv-orders", ["Orders Review", "S.V Schools Orders", "/orders/sv-orders"]],
    ["/expenses", ["Expenses", "My Expenses", "/expenses"]],
    ["/expenses/users", ["Expenses Users", "Expenses By User", "/expenses/users"]],
    ["/b2b", ["B2B", "/b2b", "/lms/b2b"]],
    ["/user-access", ["Users Center", "User Access", "User Access & Data", "Team Members", "/user-access"]],
    ["/products", ["Products", "Product", "Components", "/products"]],
    ["/proposals", ["Proposals", "Proposal", "Saved Quotations", "Products", "/proposals"]],
    ["/kits", ["Kits", "Product Kits", "Saved Kits", "Products", "/kits"]],
    ["/task-management", ["Task Management", "All Tasks", "My Tasks", "Delegated Tasks", "Department Tickets", "/task-management"]],
    ["/events", ["Events", "Event Calendar", "Event Requests", "Event Components", "/events"]],
    ["/b2c", ["B2C", "Customer Database", "Customer Form", "/b2c"]],
    ["/kpis", ["KPIs", "KPI", "Key Performance Indicators", "/kpis"]],
  ];

  const builtInAdmin = accessToken(account?.name || account?.username) === "admin" || accessToken(account?.position).includes("admin");
  for (const [route, aliases] of rules) {
    if (builtInAdmin || has(...aliases)) visible.add(route);
  }

  let currentPath = "/";
  try {
    currentPath = new URL(String(req?.originalUrl || req?.url || "/"), "http://ops.local").pathname.replace(/\/+$/, "") || "/";
  } catch {}
  if (currentPath === "/orders/new/products") visible.add("/orders/new");
  else if (currentPath.startsWith("/events/")) visible.add("/events");
  else if (currentPath.startsWith("/b2c/")) visible.add("/b2c");
  else if (currentPath.startsWith("/task-management/")) visible.add("/task-management");
  else if (rules.some(([route]) => route === currentPath)) visible.add(currentPath);

  return Array.from(visible);
}

function normalizePageAccess(value) {
  const rows = Array.isArray(value?.pages)
    ? value.pages
    : (Array.isArray(value) ? value : []);

  return {
    pages: rows.slice(0, 500).map((row) => ({
      pageId: normalizeString(row?.pageId || row?.page_id || row?.id, 160),
      pageKey: normalizeString(row?.pageKey || row?.page_key, 200),
      pageName: normalizeString(row?.pageName || row?.page_name, 300),
      aliases: normalizeStringList(row?.aliases, 40),
      routePath: normalizeString(row?.routePath || row?.route_path, 500),
      accessLevel: normalizeString(row?.accessLevel || row?.access_level, 40),
      isEnabled: row?.isEnabled !== false && row?.is_enabled !== false && row?.enabled !== false,
    })).filter((row) => row.pageId || row.pageKey || row.pageName || row.routePath),
  };
}

function buildAccountSnapshot(req) {
  const session = req?.session || {};
  const cached = session.accountCache && typeof session.accountCache === "object"
    ? session.accountCache
    : {};
  const pageAccess = normalizePageAccess(
    Array.isArray(session.pageAccess)
      ? session.pageAccess
      : (cached.pageAccess || { pages: [] }),
  );

  return {
    name: normalizeString(cached.name || cached.username || session.username, 300),
    username: normalizeString(cached.username || session.username, 300),
    department: normalizeString(cached.department, 300),
    position: normalizeString(cached.position, 300),
    email: normalizeString(cached.email, 500),
    photoUrl: normalizeString(cached.photoUrl, 4000),
    coverPhotoUrl: normalizeString(cached.coverPhotoUrl || cached.coverPhoto, 4000),
    allowedPages: normalizeStringList(
      Array.isArray(session.allowedPages) && session.allowedPages.length
        ? session.allowedPages
        : cached.allowedPages,
    ),
    pageAccess,
  };
}

function resolveEarlyBootstrap(req) {
  let url;
  try {
    url = new URL(String(req?.originalUrl || req?.url || "/"), "http://ops.local");
  } catch {
    return null;
  }

  if (url.searchParams.get("_fresh") === "1" || url.searchParams.has("_refresh")) return null;

  const pathname = String(url.pathname || "/").replace(/\/+$/, "") || "/";
  const params = new URLSearchParams();

  if (pathname === "/events/new") {
    params.set("scope", "events-new");
    const edit = normalizeString(url.searchParams.get("edit"), 160);
    if (edit) params.set("edit", edit);
  } else if (pathname === "/events/components") {
    params.set("scope", "events-components");
  } else if (pathname === "/expenses") {
    params.set("scope", "expenses");
  } else {
    return null;
  }

  return `/api/page-bootstrap?${params.toString()}`;
}

function extractPreloadLinks(html) {
  const links = [];
  const seen = new Set();

  const add = (href, as) => {
    const clean = normalizeString(href, 1000);
    if (!clean || !clean.startsWith("/") || clean.startsWith("//")) return;
    const key = `${as}:${clean}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push(`<${clean}>; rel=preload; as=${as}`);
  };

  for (const match of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    const tag = match[0] || "";
    if (/\brel=["']stylesheet["']/i.test(tag)) add(match[1], "style");
    if (links.length >= 4) break;
  }

  const commonUi = html.match(/<script\b[^>]*\bsrc=["'](\/js\/common-ui\.js[^"']*)["'][^>]*>/i);
  if (commonUi?.[1]) add(commonUi[1], "script");

  return links;
}

function buildBootScript(req) {
  const earlyBootstrapUrl = resolveEarlyBootstrap(req);
  const account = buildAccountSnapshot(req);
  const payload = {
    version: 1,
    generatedAt: Date.now(),
    path: normalizeString(req?.originalUrl || req?.url || "/", 1500),
    account,
    visibleRoutes: buildVisibleRoutes(account, req),
    pageBootstrapUrl: earlyBootstrapUrl || "",
  };

  return `<script id="ops-server-boot">\n` +
    `window.__OPS_SERVER_BOOT__=${safeJson(payload)};\n` +
    `(function(){var b=window.__OPS_SERVER_BOOT__;if(!b)return;` +
    `document.addEventListener('DOMContentLoaded',function(){try{var body=document.body;if(!body)return;var pagePath=String(location.pathname||'');` +
    `var links=document.querySelectorAll('.sidebar .nav-list>li>a[href],.sidebar-nav .nav-list>li>a[href]');` +
    `if(pagePath.indexOf('/lms')===0){links.forEach(function(a){var li=a.closest('li');if(li)li.style.removeProperty('display');});}` +
    `else{var visible=new Set(Array.isArray(b.visibleRoutes)?b.visibleRoutes:[]);links.forEach(function(a){var li=a.closest('li');if(!li)return;` +
    `var hrefPath='';try{hrefPath=new URL(a.getAttribute('href')||'',location.origin).pathname.replace(/\\\/+$/,'')||'/';}catch(e){}` +
    `if(visible.has(hrefPath))li.style.removeProperty('display');else li.style.setProperty('display','none','important');});}` +
    `var name=String((b.account&&b.account.name)||(b.account&&b.account.username)||'').trim();if(name)document.querySelectorAll('[data-username]').forEach(function(el){el.textContent=name;});` +
    `body.classList.remove('permissions-loading');body.classList.add('permissions-ready','ops-server-shell-ready');}catch(e){}},{once:true});` +
    `if(!b.pageBootstrapUrl||!window.fetch)return;var u=b.pageBootstrapUrl;var p=fetch(u,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','X-Ops-Page-Bootstrap':'early-shell'}})` +
    `.then(function(r){if(!r.ok)return null;return r.json().catch(function(){return null;});})` +
    `.catch(function(){return null;});window.__OPS_EARLY_PAGE_BOOTSTRAP__={url:u,promise:p,startedAt:Date.now()};})();\n` +
    `</script>`;
}

function injectBootScript(html, script) {
  const headClose = html.search(/<\/head\s*>/i);
  if (headClose >= 0) return `${html.slice(0, headClose)}${script}\n${html.slice(headClose)}`;
  const bodyOpen = html.search(/<body\b[^>]*>/i);
  if (bodyOpen >= 0) {
    const end = html.indexOf(">", bodyOpen);
    if (end >= 0) return `${html.slice(0, end + 1)}${script}\n${html.slice(end + 1)}`;
  }
  return `${script}\n${html}`;
}

function createPageHtmlRenderer(options = {}) {
  const publicDir = path.resolve(String(options.publicDir || ""));
  if (!options.publicDir || publicDir === path.parse(publicDir).root) {
    throw new TypeError("[pageHtmlRenderer] publicDir must point to the public directory");
  }

  const templateCache = new Map();
  const watchTemplateChanges = String(process.env.NODE_ENV || "").toLowerCase() !== "production" && !process.env.VERCEL;

  function readTemplate(filename) {
    const safeName = path.basename(String(filename || ""));
    if (!safeName.toLowerCase().endsWith(".html")) {
      const error = new Error("Only HTML pages can be rendered.");
      error.status = 400;
      throw error;
    }

    const filePath = path.join(publicDir, safeName);
    const cached = templateCache.get(filePath);
    if (cached && !watchTemplateChanges) return cached;

    const stat = fs.statSync(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached;

    const html = fs.readFileSync(filePath, "utf8");
    const next = {
      html,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      preloadLinks: extractPreloadLinks(html),
    };
    templateCache.set(filePath, next);
    return next;
  }

  function render(req, res, filename) {
    const startedAt = Date.now();
    try {
      const template = readTemplate(filename);
      const html = injectBootScript(template.html, buildBootScript(req));

      res.status(200);
      res.type("html");
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      res.set("Vary", "Cookie");
      res.set("X-Ops-HTML-Shell", "immediate");
      res.set("Server-Timing", `html-shell;dur=${Date.now() - startedAt}`);
      if (template.preloadLinks.length) res.set("Link", template.preloadLinks.join(", "));
      return res.send(html);
    } catch (error) {
      console.error(`[pageHtmlRenderer] Failed to render ${filename}:`, error?.message || error);
      return res.status(error?.status || 500).send("Unable to open this page.");
    }
  }

  return { render, clear: () => templateCache.clear() };
}

module.exports = { createPageHtmlRenderer };
