const path = require("path");
const os = require("os");

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

const requestedWorkers = String(process.env.WEB_CONCURRENCY || "").trim();
const availableCpus = typeof os.availableParallelism === "function"
  ? os.availableParallelism()
  : os.cpus().length;
const safeDefaultWorkers = Math.max(1, Math.min(2, availableCpus || 1));
const instances = requestedWorkers
  ? positiveInteger(requestedWorkers, safeDefaultWorkers)
  : safeDefaultWorkers;

module.exports = {
  apps: [
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
        PORT: process.env.PORT || "5000",
      },
      env_production: {
        NODE_ENV: "production",
        PM2_CLUSTER_MODE: "1",
        PORT: process.env.PORT || "5000",
      },
    },
  ],
};
