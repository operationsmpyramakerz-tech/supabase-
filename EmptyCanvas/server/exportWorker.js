const { parentPort } = require("worker_threads");
const { renderExportTask } = require("./exportTasks");

if (!parentPort) {
  throw new Error("exportWorker.js must run inside a Worker thread.");
}

parentPort.on("message", async (message) => {
  const id = String(message?.id || "");
  const type = String(message?.type || "");
  const startedAt = Date.now();

  try {
    const buffer = await renderExportTask(type, message?.payload || {});
    const exact = Uint8Array.from(buffer);
    parentPort.postMessage(
      {
        id,
        ok: true,
        output: exact.buffer,
        bytes: exact.byteLength,
        renderMs: Date.now() - startedAt,
      },
      [exact.buffer],
    );
  } catch (error) {
    parentPort.postMessage({
      id,
      ok: false,
      renderMs: Date.now() - startedAt,
      error: {
        name: error?.name || "Error",
        message: error?.message || String(error),
        code: error?.code || null,
        stack: String(error?.stack || "").slice(0, 12000),
      },
    });
  }
});
