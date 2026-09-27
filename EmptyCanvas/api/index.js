"use strict";

// Phase 47: the legacy Vercel backend is retired. Production routing is now
// handled by vercel.json at the edge and forwards directly to the Next.js app.
// This handler is kept only as a safety net for stale deployments that still
// invoke the historical function explicitly.
module.exports = function retiredLegacyBackend(req, res) {
  res.statusCode = 410;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({
    ok: false,
    code: "LEGACY_BACKEND_RETIRED",
    error: "The legacy backend has been retired. Use the Next.js deployment.",
    nextApp: "https://operations-hub-next-pilot.vercel.app/next/login",
  }));
};
