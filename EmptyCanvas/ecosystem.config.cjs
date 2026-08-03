const path = require("path");
const os = require("os");

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function envTrue(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

const requestedWorkers = String(process.env.WEB_CONCURRENCY || "").trim();
const availableCpus = typeof os.availableParallelism === "function"
  ? os.availableParallelism()
  : os.cpus().length;
const safeDefaultWorkers = Math.max(1, Math.min(2, availableCpus || 1));
const instances = requestedWorkers
  ? positiveInteger(requestedWorkers, safeDefaultWorkers)
  : safeDefaultWorkers;

const backendPort = positiveInteger(process.env.PORT, 5000);
const nextFrontendPort = positiveInteger(process.env.NEXT_FRONTEND_PORT, 3001);
const enableNextFrontend = envTrue(process.env.ENABLE_NEXT_FRONTEND);
const nextFrontendOrigin = process.env.NEXT_FRONTEND_ORIGIN || `http://127.0.0.1:${nextFrontendPort}`;
const legacyBackendOrigin = process.env.LEGACY_BACKEND_INTERNAL_ORIGIN || `http://127.0.0.1:${backendPort}`;

const apps = [
  {
    name: process.env.PM2_APP_NAME || "operations-hub",
    cwd: __dirname,
    script: path.join(__dirname, "server", "local.js"),
    exec_mode: "cluster",
    instances,
    instance_var: "INSTANCE_ID",

    // PM2 waits for local.js to send "ready", enabling zero-downtime reloads.
    wait_ready: true,
    listen_timeout: positiveInteger(process.env.PM2_LISTEN_TIMEOUT_MS, 20000),
    kill_timeout: positiveInteger(process.env.PM2_KILL_TIMEOUT_MS, 35000),
    shutdown_with_message: true,

    autorestart: true,
    exp_backoff_restart_delay: 100,
    max_memory_restart: process.env.PM2_MAX_MEMORY_RESTART || "750M",
    min_uptime: "10s",
    max_restarts: 10,

    merge_logs: true,
    time: true,
    out_file: process.env.PM2_OUT_LOG || path.join(__dirname, "logs", "app-out.log"),
    error_file: process.env.PM2_ERROR_LOG || path.join(__dirname, "logs", "app-error.log"),

    env: {
      NODE_ENV: "production",
      PM2_CLUSTER_MODE: "1",
      PORT: String(backendPort),
      ENABLE_NEXT_FRONTEND: enableNextFrontend ? "1" : "0",
      NEXT_FRONTEND_ORIGIN: nextFrontendOrigin,
    },
    env_production: {
      NODE_ENV: "production",
      PM2_CLUSTER_MODE: "1",
      PORT: String(backendPort),
      ENABLE_NEXT_FRONTEND: enableNextFrontend ? "1" : "0",
      NEXT_FRONTEND_ORIGIN: nextFrontendOrigin,
    },
  },
];

// The Next.js process is deliberately optional. The existing Express ERP stays
// production-safe until the pilot has been installed, built, and explicitly
// enabled with ENABLE_NEXT_FRONTEND=true.
if (enableNextFrontend) {
  apps.push({
    name: process.env.PM2_NEXT_APP_NAME || "operations-hub-next",
    cwd: path.join(__dirname, "next-frontend"),
    script: path.join(__dirname, "next-frontend", "server.js"),
    exec_mode: "fork",
    instances: 1,

    wait_ready: true,
    listen_timeout: positiveInteger(process.env.PM2_NEXT_LISTEN_TIMEOUT_MS, 45000),
    kill_timeout: positiveInteger(process.env.PM2_NEXT_KILL_TIMEOUT_MS, 25000),
    shutdown_with_message: true,

    autorestart: true,
    exp_backoff_restart_delay: 250,
    max_memory_restart: process.env.PM2_NEXT_MAX_MEMORY_RESTART || "600M",
    min_uptime: "10s",
    max_restarts: 10,

    merge_logs: true,
    time: true,
    out_file: process.env.PM2_NEXT_OUT_LOG || path.join(__dirname, "logs", "next-out.log"),
    error_file: process.env.PM2_NEXT_ERROR_LOG || path.join(__dirname, "logs", "next-error.log"),

    env: {
      NODE_ENV: "production",
      NEXT_FRONTEND_HOST: process.env.NEXT_FRONTEND_HOST || "127.0.0.1",
      NEXT_FRONTEND_PORT: String(nextFrontendPort),
      NEXT_FRONTEND_BASE_PATH: process.env.NEXT_FRONTEND_BASE_PATH || "/next",
      LEGACY_BACKEND_INTERNAL_ORIGIN: legacyBackendOrigin,
    },
    env_production: {
      NODE_ENV: "production",
      NEXT_FRONTEND_HOST: process.env.NEXT_FRONTEND_HOST || "127.0.0.1",
      NEXT_FRONTEND_PORT: String(nextFrontendPort),
      NEXT_FRONTEND_BASE_PATH: process.env.NEXT_FRONTEND_BASE_PATH || "/next",
      LEGACY_BACKEND_INTERNAL_ORIGIN: legacyBackendOrigin,
    },
  });
}

module.exports = { apps };
