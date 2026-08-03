"use strict";

const http = require("http");
const next = require("next");

const dev = String(process.env.NODE_ENV || "production").toLowerCase() !== "production";
const hostname = String(process.env.NEXT_FRONTEND_HOST || "127.0.0.1").trim() || "127.0.0.1";
const port = Math.max(1, Number(process.env.NEXT_FRONTEND_PORT || process.env.PORT || 3001) || 3001);
const shutdownTimeoutMs = Math.max(5000, Number(process.env.NEXT_FRONTEND_SHUTDOWN_TIMEOUT_MS || 20000) || 20000);

const nextApp = next({ dev, hostname, port });
const handle = nextApp.getRequestHandler();

let server = null;
let shuttingDown = false;

async function shutdown(signal = "shutdown") {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[next-frontend] ${signal} received; stopping.`);

  const forceTimer = setTimeout(() => {
    console.error("[next-frontend] graceful shutdown timed out; forcing exit.");
    process.exit(1);
  }, shutdownTimeoutMs);
  forceTimer.unref?.();

  if (!server) {
    clearTimeout(forceTimer);
    process.exit(0);
    return;
  }

  server.close(() => {
    clearTimeout(forceTimer);
    process.exit(0);
  });
  server.closeIdleConnections?.();
}

async function main() {
  await nextApp.prepare();
  server = http.createServer((req, res) => handle(req, res));
  server.keepAliveTimeout = Math.max(1000, Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 65000) || 65000);
  server.headersTimeout = Math.max(server.keepAliveTimeout + 1000, Number(process.env.HEADERS_TIMEOUT_MS || 66000) || 66000);

  server.listen(port, hostname, () => {
    console.log(`[next-frontend] ready on http://${hostname}:${port}/next`);
    if (typeof process.send === "function") process.send("ready");
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
process.on("message", (message) => {
  if (message === "shutdown") shutdown("PM2 shutdown message");
});
process.on("uncaughtException", (error) => {
  console.error("[next-frontend] uncaughtException:", error);
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  console.error("[next-frontend] unhandledRejection:", reason);
  shutdown("unhandledRejection");
});

main().catch((error) => {
  console.error("[next-frontend] startup failed:", error);
  process.exit(1);
});
