// A single allow-list for the shared Kits / Proposals export endpoint.
// This is intentionally independent of Next.js and Supabase so denial paths
// can be regression-tested without connecting to production services.
const PRODUCT_EXPORT_SCOPES = Object.freeze({
  kit: Object.freeze({ pages: Object.freeze(["Kits", "Proposals", "Products"]), permissions: Object.freeze(["kits.view"]) }),
  proposal: Object.freeze({ pages: Object.freeze(["Proposals", "Products"]), permissions: Object.freeze(["proposals.view"]) }),
  combined: Object.freeze({ pages: Object.freeze(["Proposals", "Products"]), permissions: Object.freeze(["proposals.view", "proposals.combine"]) }),
});

export function productExportPolicy(scope) {
  return PRODUCT_EXPORT_SCOPES[String(scope ?? "").trim().toLowerCase()] || null;
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

export function validateProductExportParams(params) {
  const scope = String(params?.get?.("scope") || "proposal").trim().toLowerCase();
  const policy = productExportPolicy(scope);
  if (!policy) badRequest("Unsupported product export scope.");
  const kind = String(params?.get?.("kind") || "pdf").trim().toLowerCase();
  if (kind !== "pdf" && kind !== "excel") badRequest("Unsupported product export format.");
  if (scope === "combined") {
    const raw = String(params?.get?.("proposalIds") || params?.get?.("ids") || "");
    const ids = raw.split(",").map(v => v.trim()).filter(Boolean);
    if (ids.length < 2 || ids.length > 200 || new Set(ids).size !== ids.length || ids.some(id => id.length > 160)) {
      badRequest("Select between 2 and 200 distinct proposals for export.");
    }
  } else {
    const id = String(params?.get?.("id") || "").trim();
    if (!id || id.length > 160) badRequest("A valid kit or proposal ID is required for export.");
  }
  return { scope, kind, policy };
}
