"use strict";

const http = require("http");
const https = require("https");

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const diagnostics = {
  enabled: false,
  basePath: "/next",
  targetOrigin: "http://127.0.0.1:3001",
  requests: 0,
  completed: 0,
  failed: 0,
  unavailable: 0,
  active: 0,
  lastLatencyMs: 0,
  averageLatencyMs: 0,
  lastError: "",
  lastRequestAt: 0,
};

function envTrue(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function normalizeBasePath(value) {
  const clean = String(value || "/next").trim().replace(/\/+$/, "");
  if (!clean || clean === "/") return "/next";
  return clean.startsWith("/") ? clean : `/${clean}`;
}

function normalizeTargetOrigin(value) {
  const raw = String(value || "http://127.0.0.1:3001").trim();
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("unsupported protocol");
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "http://127.0.0.1:3001";
  }
}

function requestMatchesBasePath(req, basePath) {
  const pathname = String(req.originalUrl || req.url || "").split("?")[0] || "/";
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

function appendForwardedFor(existing, remoteAddress) {
  const current = String(existing || "").trim();
  const remote = String(remoteAddress || "").trim();
  if (!remote) return current;
  return current ? `${current}, ${remote}` : remote;
}

function copyRequestHeaders(req, targetUrl, basePath) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers || {})) {
    const lower = String(name || "").toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || typeof value === "undefined") continue;
    headers[name] = value;
  }

  headers.host = targetUrl.host;
  headers["x-forwarded-host"] = String(req.headers?.host || "");
  headers["x-forwarded-proto"] = req.secure ? "https" : String(req.headers?.["x-forwarded-proto"] || "http").split(",")[0].trim();
  headers["x-forwarded-for"] = appendForwardedFor(req.headers?.["x-forwarded-for"], req.socket?.remoteAddress);
  headers["x-forwarded-prefix"] = basePath;
  headers["x-operations-hub-proxy"] = "next-frontend";

  return headers;
}

function copyResponseHeaders(upstreamResponse, res) {
  for (const [name, value] of Object.entries(upstreamResponse.headers || {})) {
    const lower = String(name || "").toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || typeof value === "undefined") continue;
    try {
      res.setHeader(name, value);
    } catch {}
  }
}

function unavailableResponse(req, res, message) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Retry-After", "5");
  const acceptsJson = String(req.headers?.accept || "").includes("application/json");
  if (acceptsJson) {
    return res.status(503).json({
      ok: false,
      code: "NEXT_FRONTEND_UNAVAILABLE",
      error: message,
      legacyHome: "/home",
    });
  }

  return res.status(503).type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Next frontend unavailable</title>
<style>body{font-family:Arial,sans-serif;background:#f6f7fb;color:#172033;margin:0;display:grid;place-items:center;min-height:100vh}.card{max-width:560px;background:#fff;border:1px solid #dde3ee;border-radius:16px;padding:28px;box-shadow:0 12px 32px rgba(16,24,40,.08)}a{color:#4f46e5;font-weight:700}</style></head>
<body><main class="card"><h1>Next.js pilot is not available</h1><p>${String(message || "The pilot frontend is not running.")}</p><p><a href="/home">Return to the current system</a></p></main></body></html>`);
}

function createNextFrontendProxy(options = {}) {
  const enabled = typeof options.enabled === "boolean"
    ? options.enabled
    : envTrue(process.env.ENABLE_NEXT_FRONTEND);
  const basePath = normalizeBasePath(options.basePath || process.env.NEXT_FRONTEND_BASE_PATH || "/next");
  const targetOrigin = normalizeTargetOrigin(options.targetOrigin || process.env.NEXT_FRONTEND_ORIGIN || "http://127.0.0.1:3001");
  const timeoutMs = Math.max(2000, Number(options.timeoutMs || process.env.NEXT_FRONTEND_PROXY_TIMEOUT_MS || 30000) || 30000);

  diagnostics.enabled = enabled;
  diagnostics.basePath = basePath;
  diagnostics.targetOrigin = targetOrigin;

  return function nextFrontendProxy(req, res, next) {
    if (!requestMatchesBasePath(req, basePath)) return next();

    if (!enabled) {
      diagnostics.unavailable += 1;
      return unavailableResponse(req, res, "Enable the pilot with ENABLE_NEXT_FRONTEND=true after building the Next.js frontend.");
    }

    const startedAt = Date.now();
    diagnostics.requests += 1;
    diagnostics.active += 1;
    diagnostics.lastRequestAt = startedAt;

    let targetUrl;
    try {
      targetUrl = new URL(String(req.originalUrl || req.url || basePath), `${targetOrigin}/`);
    } catch (error) {
      diagnostics.failed += 1;
      diagnostics.active = Math.max(0, diagnostics.active - 1);
      diagnostics.lastError = error?.message || String(error);
      return unavailableResponse(req, res, "The Next.js proxy target is invalid.");
    }

    const transport = targetUrl.protocol === "https:" ? https : http;
    const upstreamRequest = transport.request({
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
      method: req.method,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      headers: copyRequestHeaders(req, targetUrl, basePath),
      timeout: timeoutMs,
      agent: targetUrl.protocol === "https:" ? https.globalAgent : http.globalAgent,
    });

    let settled = false;
    const finish = (ok, error = null) => {
      if (settled) return;
      settled = true;
      diagnostics.active = Math.max(0, diagnostics.active - 1);
      const latency = Math.max(0, Date.now() - startedAt);
      diagnostics.lastLatencyMs = latency;
      diagnostics.averageLatencyMs = diagnostics.completed
        ? Math.round(((diagnostics.averageLatencyMs * diagnostics.completed) + latency) / (diagnostics.completed + 1))
        : latency;
      if (ok) diagnostics.completed += 1;
      else diagnostics.failed += 1;
      diagnostics.lastError = error ? (error?.message || String(error)) : "";
    };

    upstreamRequest.on("response", (upstreamResponse) => {
      res.statusCode = Number(upstreamResponse.statusCode) || 502;
      if (upstreamResponse.statusMessage) res.statusMessage = upstreamResponse.statusMessage;
      copyResponseHeaders(upstreamResponse, res);
      res.setHeader("X-ERP-Frontend", "next-pilot");

      upstreamResponse.on("error", (error) => {
        finish(false, error);
        if (!res.headersSent) unavailableResponse(req, res, "The Next.js frontend closed the response unexpectedly.");
        else res.destroy(error);
      });
      upstreamResponse.on("end", () => finish(true));
      upstreamResponse.pipe(res);
    });

    upstreamRequest.on("timeout", () => {
      const error = new Error(`Next.js frontend timed out after ${timeoutMs}ms.`);
      error.code = "NEXT_FRONTEND_TIMEOUT";
      upstreamRequest.destroy(error);
    });

    upstreamRequest.on("error", (error) => {
      finish(false, error);
      diagnostics.unavailable += 1;
      if (!res.headersSent && !res.writableEnded) {
        unavailableResponse(req, res, "The Next.js pilot process is not reachable. The legacy ERP remains available.");
      } else if (!res.writableEnded) {
        res.destroy(error);
      }
    });

    req.on("aborted", () => upstreamRequest.destroy());
    res.on("close", () => {
      if (!res.writableEnded) upstreamRequest.destroy();
    });

    req.pipe(upstreamRequest);
  };
}

function getNextFrontendDiagnostics() {
  return {
    ...diagnostics,
    active: Math.max(0, diagnostics.active),
  };
}

module.exports = {
  createNextFrontendProxy,
  getNextFrontendDiagnostics,
};
