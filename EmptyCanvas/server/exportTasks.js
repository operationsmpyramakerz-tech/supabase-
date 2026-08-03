const { PassThrough } = require("stream");

const SUPPORTED_EXPORT_TASKS = Object.freeze([
  "delivery-pdf",
  "maintenance-pdf",
  "event-request-pdf",
  "expense-pdf",
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

async function renderExpensePdf(payload) {
  const generateExpensePDF = require("./pdfGenerator");
  return await new Promise((resolve, reject) => {
    generateExpensePDF(payload || {}, (error, buffer) => {
      if (error) reject(error);
      else resolve(Buffer.from(buffer || []));
    });
  });
}

async function renderExportTask(type, payload) {
  switch (String(type || "")) {
    case "delivery-pdf": {
      const { pipeDeliveryReceiptPDF } = require("./deliveryReceiptPdf");
      return await renderPipedPdf(pipeDeliveryReceiptPDF, payload || {});
    }
    case "maintenance-pdf": {
      const { pipeMaintenanceReceiptPDF } = require("./maintenanceReceiptPdf");
      return await renderPipedPdf(pipeMaintenanceReceiptPDF, payload || {});
    }
    case "event-request-pdf": {
      const { pipeEventRequestPDF } = require("./eventRequestPdf");
      return await renderPipedPdf(pipeEventRequestPDF, payload || {});
    }
    case "expense-pdf":
      return await renderExpensePdf(payload || {});
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
