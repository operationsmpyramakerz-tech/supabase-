const path = require("path");
const os = require("os");
const { Worker } = require("worker_threads");
const { renderExportTask, SUPPORTED_EXPORT_TASKS } = require("./exportTasks");

function envBoolean(name, fallback) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function positiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return fallback;
  return Math.min(number, max);
}

const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const availableCpus = typeof os.availableParallelism === "function"
  ? os.availableParallelism()
  : (os.cpus()?.length || 1);
const enabled = envBoolean("EXPORT_WORKERS_ENABLED", !isServerless);
const concurrency = enabled
  ? positiveInteger(process.env.EXPORT_WORKER_CONCURRENCY, 1, Math.max(1, Math.min(4, availableCpus)))
  : 0;
const queueLimit = positiveInteger(process.env.EXPORT_QUEUE_MAX, 24, 250);
const jobTimeoutMs = positiveInteger(process.env.EXPORT_JOB_TIMEOUT_MS, 120000, 15 * 60 * 1000);
const maxOutputBytes = positiveInteger(process.env.EXPORT_MAX_OUTPUT_BYTES, 50 * 1024 * 1024, 250 * 1024 * 1024);
const inlineFallback = envBoolean("EXPORT_INLINE_FALLBACK", false);

const workers = [];
const queue = [];
const jobs = new Map();
let sequence = 0;
let closing = false;

const stats = {
  submitted: 0,
  completed: 0,
  failed: 0,
  timedOut: 0,
  rejected: 0,
  workerCrashes: 0,
  inlineRuns: 0,
  workerRuns: 0,
  totalQueueMs: 0,
  totalRenderMs: 0,
  maxQueueDepth: 0,
  lastError: null,
};

function supportedType(type) {
  return SUPPORTED_EXPORT_TASKS.includes(String(type || ""));
}

function serializeError(raw, fallbackMessage = "Export worker failed") {
  const error = new Error(raw?.message || fallbackMessage);
  error.name = raw?.name || "Error";
  if (raw?.code) error.code = raw.code;
  if (raw?.stack) error.stack = raw.stack;
  return error;
}

function clearJobTimer(job) {
  if (job?.timer) clearTimeout(job.timer);
}

function settleJob(id, error, result) {
  const job = jobs.get(id);
  if (!job) return;
  jobs.delete(id);
  clearJobTimer(job);

  if (error) {
    stats.failed += 1;
    stats.lastError = {
      at: new Date().toISOString(),
      type: job.type,
      message: error?.message || String(error),
      code: error?.code || null,
    };
    job.reject(error);
  } else {
    stats.completed += 1;
    stats.totalQueueMs += Number(result?.queueMs) || 0;
    stats.totalRenderMs += Number(result?.renderMs) || 0;
    job.resolve(result);
  }
}

function startWorker(slot) {
  if (closing || !enabled) return;
  let worker;
  try {
    worker = new Worker(path.join(__dirname, "exportWorker.js"));
  } catch (error) {
    stats.workerCrashes += 1;
    stats.lastError = {
      at: new Date().toISOString(),
      type: "worker-startup",
      message: error?.message || String(error),
      code: error?.code || null,
    };
    slot.worker = null;
    slot.busy = false;
    slot.jobId = null;
    return;
  }
  slot.worker = worker;
  slot.busy = false;
  slot.jobId = null;
  slot.errorSeen = false;

  worker.on("message", (message) => {
    const id = String(message?.id || slot.jobId || "");
    const job = jobs.get(id);
    slot.busy = false;
    slot.jobId = null;

    if (!job) {
      dispatch();
      return;
    }

    if (!message?.ok) {
      settleJob(id, serializeError(message?.error));
      dispatch();
      return;
    }

    const bytes = Number(message?.bytes) || 0;
    if (bytes > maxOutputBytes) {
      const error = new Error(`Generated export is too large (${bytes} bytes).`);
      error.code = "EXPORT_OUTPUT_TOO_LARGE";
      settleJob(id, error);
      dispatch();
      return;
    }

    stats.workerRuns += 1;
    settleJob(id, null, {
      buffer: Buffer.from(message.output || new ArrayBuffer(0)),
      mode: "worker",
      queueMs: Math.max(0, (job.startedAt || Date.now()) - job.queuedAt),
      renderMs: Number(message?.renderMs) || 0,
      bytes,
    });
    dispatch();
  });

  worker.on("error", (error) => {
    slot.errorSeen = true;
    stats.workerCrashes += 1;
    if (slot.jobId) {
      const currentId = slot.jobId;
      slot.jobId = null;
      slot.busy = false;
      settleJob(currentId, error);
    }
  });

  worker.on("exit", (code) => {
    if (code !== 0 && !closing && !slot.errorSeen) stats.workerCrashes += 1;
    const activeId = slot.jobId;
    slot.worker = null;
    slot.jobId = null;
    slot.busy = false;

    if (activeId) {
      const error = new Error(`Export worker exited with code ${code}.`);
      error.code = "EXPORT_WORKER_EXIT";
      settleJob(activeId, error);
    }

    if (!closing) {
      setTimeout(() => {
        startWorker(slot);
        dispatch();
      }, code === 0 ? 0 : 250).unref?.();
    }
  });
}

function ensureWorkers() {
  if (!enabled || closing) return;
  while (workers.length < concurrency) {
    const slot = { worker: null, busy: false, jobId: null, errorSeen: false };
    workers.push(slot);
    startWorker(slot);
  }
}

function timeoutJob(id) {
  const job = jobs.get(id);
  if (!job) return;
  stats.timedOut += 1;
  const error = new Error(`Export job timed out after ${jobTimeoutMs}ms.`);
  error.code = "EXPORT_JOB_TIMEOUT";

  const queuedIndex = queue.findIndex((item) => item.id === id);
  if (queuedIndex >= 0) queue.splice(queuedIndex, 1);

  const slot = workers.find((item) => item.jobId === id);
  if (slot?.worker) {
    slot.worker.terminate().catch(() => {});
  }
  settleJob(id, error);
  dispatch();
}

function dispatch() {
  if (!enabled || closing) return;
  ensureWorkers();
  for (const slot of workers) {
    if (!queue.length) break;
    if (!slot.worker || slot.busy) continue;
    const job = queue.shift();
    if (!job || !jobs.has(job.id)) continue;
    job.startedAt = Date.now();
    slot.busy = true;
    slot.jobId = job.id;
    try {
      slot.worker.postMessage({ id: job.id, type: job.type, payload: job.payload });
    } catch (error) {
      slot.busy = false;
      slot.jobId = null;
      settleJob(job.id, error);
      setImmediate(dispatch);
    }
  }
}

async function runInline(type, payload, queuedAt) {
  const startedAt = Date.now();
  try {
    const buffer = await renderExportTask(type, payload);
    if (buffer.length > maxOutputBytes) {
      const error = new Error(`Generated export is too large (${buffer.length} bytes).`);
      error.code = "EXPORT_OUTPUT_TOO_LARGE";
      throw error;
    }
    stats.inlineRuns += 1;
    stats.completed += 1;
    const result = {
      buffer,
      mode: "inline",
      queueMs: Math.max(0, startedAt - queuedAt),
      renderMs: Date.now() - startedAt,
      bytes: buffer.length,
    };
    stats.totalQueueMs += result.queueMs;
    stats.totalRenderMs += result.renderMs;
    return result;
  } catch (error) {
    stats.failed += 1;
    stats.lastError = {
      at: new Date().toISOString(),
      type,
      message: error?.message || String(error),
      code: error?.code || null,
    };
    throw error;
  }
}

async function runExportTask(type, payload = {}) {
  const taskType = String(type || "");
  if (!supportedType(taskType)) {
    const error = new Error(`Unsupported export task: ${taskType || "unknown"}`);
    error.code = "UNSUPPORTED_EXPORT_TASK";
    throw error;
  }
  if (closing) {
    const error = new Error("Export workers are shutting down.");
    error.code = "EXPORT_WORKERS_CLOSING";
    throw error;
  }

  stats.submitted += 1;
  const queuedAt = Date.now();

  if (!enabled) {
    return await runInline(taskType, payload, queuedAt);
  }

  ensureWorkers();
  if (!workers.some((slot) => slot.worker)) {
    if (inlineFallback) return await runInline(taskType, payload, queuedAt);
    const error = new Error("Background export workers are unavailable.");
    error.code = "EXPORT_WORKER_UNAVAILABLE";
    stats.rejected += 1;
    throw error;
  }
  if (queue.length >= queueLimit) {
    stats.rejected += 1;
    if (inlineFallback) return await runInline(taskType, payload, queuedAt);
    const error = new Error("The export queue is busy. Please try again shortly.");
    error.code = "EXPORT_QUEUE_FULL";
    throw error;
  }

  const id = `${process.pid}-${Date.now()}-${++sequence}`;
  return await new Promise((resolve, reject) => {
    const job = {
      id,
      type: taskType,
      payload,
      queuedAt,
      startedAt: 0,
      resolve,
      reject,
      timer: null,
    };
    job.timer = setTimeout(() => timeoutJob(id), jobTimeoutMs);
    job.timer.unref?.();
    jobs.set(id, job);
    queue.push(job);
    stats.maxQueueDepth = Math.max(stats.maxQueueDepth, queue.length);
    dispatch();
  });
}

function getExportWorkerDiagnostics() {
  const active = workers.filter((slot) => slot.busy).length;
  const completed = Math.max(1, stats.completed);
  return {
    enabled,
    serverless: isServerless,
    concurrency,
    queueLimit,
    queued: queue.length,
    active,
    workers: workers.length,
    closing,
    timeoutMs: jobTimeoutMs,
    maxOutputBytes,
    inlineFallback,
    supportedTasks: SUPPORTED_EXPORT_TASKS.slice(),
    stats: {
      ...stats,
      averageQueueMs: Math.round(stats.totalQueueMs / completed),
      averageRenderMs: Math.round(stats.totalRenderMs / completed),
    },
  };
}

async function closeExportWorkers() {
  if (closing) return;
  closing = true;

  while (queue.length) {
    const job = queue.shift();
    const error = new Error("Export job cancelled because the server is shutting down.");
    error.code = "EXPORT_WORKERS_CLOSING";
    settleJob(job.id, error);
  }

  const terminations = workers
    .map((slot) => slot.worker)
    .filter(Boolean)
    .map((worker) => worker.terminate().catch(() => null));
  await Promise.allSettled(terminations);
  workers.length = 0;
}

module.exports = {
  runExportTask,
  getExportWorkerDiagnostics,
  closeExportWorkers,
};
