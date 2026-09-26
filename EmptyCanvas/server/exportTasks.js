const { PassThrough } = require("stream");

const SUPPORTED_EXPORT_TASKS = Object.freeze([
  "event-request-pdf",
]);

function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.once("end", finish);
    stream.once("error", fail);
  });
}

async function renderPipedPdf(renderer, payload) {
  const stream = new PassThrough();
  const bufferPromise = collectStream(stream);
  await renderer(payload, stream);
  return await bufferPromise;
}

async function renderExportTask(type, payload) {
  switch (String(type || "")) {
    case "event-request-pdf": {
      const { pipeEventRequestPDF } = require("./eventRequestPdf");
      return await renderPipedPdf(pipeEventRequestPDF, payload || {});
    }
    default: {
      const error = new Error(`Unsupported export task: ${String(type || "unknown")}`);
      error.code = "UNSUPPORTED_EXPORT_TASK";
      throw error;
    }
  }
}

module.exports = {
  SUPPORTED_EXPORT_TASKS,
  renderExportTask,
};
