// EmptyCanvas/server/local.js
const http = require("http");
const app = require("./app");
const {
  getSessionDiagnostics,
  closeSessionResources,
} = require("./session-redis");

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

function envTrue(name) {
  return ["1", "true", "yes", "on"].includes(String(process.env[name] || "").trim().toLowerCase());
}

function clusterModeRequested() {
  return (
    envTrue("PM2_CLUSTER_MODE") ||
    process.env.NODE_APP_INSTANCE !== undefined ||
    process.env.INSTANCE_ID !== undefined ||
    Number(process.env.WEB_CONCURRENCY || 1) > 1
  );
}

function validateClusterSafety() {
  const diagnostics = getSessionDiagnostics();
  const clustered = clusterModeRequested();
  const allowUnsafeMemory = envTrue("ALLOW_UNSAFE_MEMORY_SESSIONS");

  if (clustered && !diagnostics.persistent && !allowUnsafeMemory) {
    console.error(
      "[startup] Cluster mode requires Redis/Upstash-backed sessions. " +
      "Configure UPSTASH_REDIS_URL or UPSTASH_REDIS_REST_URL + " +
      "UPSTASH_REDIS_REST_TOKEN. Set ALLOW_UNSAFE_MEMORY_SESSIONS=true " +
      "only for temporary testing.",
    );
    process.exitCode = 1;
    return false;
  }

  if (String(process.env.NODE_ENV || "").toLowerCase() === "production" && !diagnostics.hasSessionSecret) {
    console.error("[startup] SESSION_SECRET is required in production.");
    process.exitCode = 1;
    return false;
  }

  return true;
}

if (!validateClusterSafety()) {
  process.exit(process.exitCode || 1);
}

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

// Keep connections reusable, but do not leave dead clients attached forever.
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

  console.log(
    `[shutdown] ${signal} received by pid=${process.pid}; draining ${activeRequests} active request(s).`,
  );

  const forceTimer = setTimeout(() => {
    console.error(
      `[shutdown] Grace period exceeded after ${SHUTDOWN_TIMEOUT_MS}ms; forcing ${activeRequests} connection(s) closed.`,
    );
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref?.();

  // Stop taking new requests. Existing connections are allowed to complete.
  server.close(async (error) => {
    try {
      await closeSessionResources();
    } catch (closeError) {
      console.error("[shutdown] Redis close failed:", closeError?.message || closeError);
    }

    clearTimeout(forceTimer);
    if (error) {
      console.error("[shutdown] HTTP server close failed:", error?.message || error);
      process.exit(1);
      return;
    }

    console.log(`[shutdown] pid=${process.pid} stopped cleanly.`);
    process.exit(0);
  });

  // Node 18.2+ can close idle keep-alive sockets immediately while preserving
  // active requests, making PM2 zero-downtime reloads finish faster.
  if (typeof server.closeIdleConnections === "function") {
    server.closeIdleConnections();
  }
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
  const session = getSessionDiagnostics();
  console.log(
    `[startup] http://${HOST}:${PORT} pid=${process.pid} worker=${worker} ` +
    `session=${session.storeType} cache=${session.cacheBackend}`,
  );

  // PM2 wait_ready=true waits for this message before routing/reloading.
  if (typeof process.send === "function") {
    process.send("ready");
  }
});

module.exports = { server, gracefulShutdown };
