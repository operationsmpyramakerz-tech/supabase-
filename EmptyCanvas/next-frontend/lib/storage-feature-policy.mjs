// Shared, dependency-free policy: OR of AND-groups of feature permissions.
// Even a signed file reference needs feature access at download time.
const FEATURE_REQUIREMENTS = Object.freeze({
  "task-management/attachments": Object.freeze({
    read: [["tasks.view"]],
    write: [["tasks.attachment_upload"]],
  }),
  "b2c/customer-files": Object.freeze({
    read: [["b2c.forms.view"], ["b2c.database.view"]],
    write: [["b2c.forms.submit"], ["b2c.database.record_edit"]],
  }),
  "kpi-evidence": Object.freeze({
    read: [["kpis.view"]],
    write: [["kpis.evidence_upload", "kpis.scores_edit"]],
  }),
});
export function storageFeatureAllowed(prefix, write, allowed) {
  const groups = FEATURE_REQUIREMENTS[String(prefix || "")]?.[write ? "write" : "read"];
  return Boolean(groups?.some(group => group.every(key => allowed(key))));
}
