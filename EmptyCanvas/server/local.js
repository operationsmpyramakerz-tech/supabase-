"use strict";

const http = require("http");
const app = require("./app");

const PORT = Math.max(1, Number(process.env.PORT || 5000) || 5000);
const HOST = String(process.env.HOST || "0.0.0.0").trim() || "0.0.0.0";
const SHUTDOWN_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS || 30000) || 30000,
);

const runtimeState = app.locals.runtimeState || {
  startedAt: Date.now(),
  ready: false,
  draining: false,
};
app.locals.runtimeState = runtimeState;

let activeRequests = 0;
let shuttingDown = false;

const server = http.createServer((req, res) => {
  activeRequests += 1;
  let counted = true;
  const finishRequest = () => {
    if (!counted) return;
    counted = false;
    activeRequests = Math.max(0, activeRequests - 1);
  };

  res.once("finish", finishRequest);
  res.once("close", finishRequest);
  app(req, res);
});

server.keepAliveTimeout = Math.max(1000, Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 65000) || 65000);
server.headersTimeout = Math.max(
  server.keepAliveTimeout + 1000,
  Number(process.env.HEADERS_TIMEOUT_MS || 66000) || 66000,
);
server.requestTimeout = Math.max(0, Number(process.env.REQUEST_TIMEOUT_MS || 120000) || 120000);

async function gracefulShutdown(signal = "shutdown") {
  if (shuttingDown) return;
  shuttingDown = true;
  runtimeState.draining = true;
  runtimeState.ready = false;

  console.log(`[shutdown] ${signal} received by pid=${process.pid}; draining ${activeRequests} request(s).`);

  const forceTimer = setTimeout(() => {
    console.error(`[shutdown] Grace period exceeded after ${SHUTDOWN_TIMEOUT_MS}ms.`);
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref?.();

  server.close((error) => {
    clearTimeout(forceTimer);
    if (error) {
      console.error("[shutdown] HTTP server close failed:", error?.message || error);
      process.exit(1);
      return;
    }
    console.log(`[shutdown] pid=${process.pid} stopped cleanly.`);
    process.exit(0);
  });

  if (typeof server.closeIdleConnections === "function") server.closeIdleConnections();
}

process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.once("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("message", (message) => {
  if (message === "shutdown") gracefulShutdown("PM2 shutdown message");
});

process.on("uncaughtException", (error) => {
  console.error("[fatal] uncaughtException:", error);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandledRejection:", reason);
  gracefulShutdown("unhandledRejection");
});

server.listen(PORT, HOST, () => {
  runtimeState.ready = true;
  runtimeState.draining = false;
  const worker = String(process.env.NODE_APP_INSTANCE ?? process.env.INSTANCE_ID ?? "standalone");
  console.log(`[startup] compatibility shell http://${HOST}:${PORT} pid=${process.pid} worker=${worker}`);
  if (typeof process.send === "function") process.send("ready");
});

module.exports = { server, gracefulShutdown };
