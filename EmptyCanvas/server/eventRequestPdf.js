// Compatibility shim retained until the legacy Express server is removed.
// Event PDF rendering now lives in the Next.js server library.
module.exports = require("../next-frontend/lib/eventRequestPdf");
