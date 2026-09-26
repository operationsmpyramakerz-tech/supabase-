const SUPPORTED_EXPORT_TASKS = Object.freeze([]);

async function renderExportTask(type) {
  const error = new Error(`Unsupported export task: ${String(type || "unknown")}`);
  error.code = "UNSUPPORTED_EXPORT_TASK";
  throw error;
}

module.exports = {
  SUPPORTED_EXPORT_TASKS,
  renderExportTask,
};
