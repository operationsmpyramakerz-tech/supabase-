// Phase 6: pure, read-only Preparing project reporting. No server or UI imports.
import { PREPARING_STAGES } from "./preparing-workflow.js";
import { CLOSING_CHECKS } from "./preparing-closing.js";
import { TECHNICAL_CHECKPOINTS } from "./preparing-technical.js";

const arr = value => Array.isArray(value) ? value : [];
const number = value => Math.max(0, Number(value) || 0);
const datePart = value => typeof value === "string" ? value.slice(0, 10) : "";
const stages = PREPARING_STAGES.map(row => row.key);
const buckets = (rows, key = "school_id") => {
  const result = new Map();
  for (const row of arr(rows)) {
    if (!row || !row[key]) continue;
    if (!result.has(row[key])) result.set(row[key], []);
    result.get(row[key]).push(row);
  }
  return result;
};
const find = (map, id) => map.get(id) || [];
export function cairoDate(now = new Date()) {
  // en-CA format is not consistently ISO in every Node ICU version; use formatToParts.
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const piece = name => parts.find(part => part.type === name)?.value || "";
  return `${piece("year")}-${piece("month")}-${piece("day")}`;
}

export function buildPreparingProjectReport({ project, schools = [], progress = [], components = [],
  shipments = [], shipmentLines = [], issues = [], checkpoints = [], acceptances = [],
  closingChecks = [], approvals = [], returns = [], today = cairoDate() } = {}) {
  const byStage = buckets(progress), byComponents = buckets(components), byShipment = buckets(shipments);
  const byLines = buckets(shipmentLines), byIssues = buckets(issues), byCheckpoints = buckets(checkpoints);
  const byAcceptance = buckets(acceptances), byClosing = buckets(closingChecks), byApproval = buckets(approvals);
  const byReturns = buckets(returns);
  const rows = arr(schools).map(school => {
    const id = school.id;
    const stageRecords = find(byStage, id);
    const complete = new Set(stageRecords.filter(row => row.status === "completed").map(row => row.stage_key));
    const activeStage = PREPARING_STAGES.find(row => !complete.has(row.key)) || PREPARING_STAGES.at(-1);
    const stageRecord = stageRecords.find(row => row.stage_key === activeStage.key);
    const stageStatus = stageRecord?.status || "not_started";
    const currentIssues = find(byIssues, id);
    const openIssues = currentIssues.filter(row => row.status !== "resolved");
    const overdueIssues = openIssues.filter(row => datePart(row.due_date) && datePart(row.due_date) < today);
    const currentComponents = find(byComponents, id);
    const currentShipments = find(byShipment, id);
    const activeShipments = currentShipments.filter(row => row.status !== "cancelled");
    const shipmentById = new Map(activeShipments.map(row => [row.id, row]));
    const lines = find(byLines, id).filter(row => shipmentById.has(row.shipment_id));
    const schoolReturns = find(byReturns, id);
    const returnedQty = schoolReturns.reduce((sum,row)=>sum+number(row.quantity),0);
    const grossSignedQty = lines.reduce((sum,row)=>sum+(shipmentById.get(row.shipment_id)?.status === "delivered" ? number(row.received_qty) : 0),0);
    const currentCheckpoints = find(byCheckpoints, id);
    const currentClosing = find(byClosing, id);
    const acceptance = find(byAcceptance, id)[0];
    const approval = find(byApproval, id)[0];
    const stageClosed = complete.has("final_closing");
    const approved = approval?.status === "approved";
    const closed = stageClosed && approved;
    const signed = activeShipments.filter(row => row.status === "delivered" && row.receipt_reference?.trim());
    const hasManifest = currentComponents.length > 0;
    const quantities = hasManifest ? {
      planned: currentComponents.reduce((sum, row) => sum + number(row.planned_qty), 0),
      received: currentComponents.reduce((sum, row) => sum + number(row.received_qty), 0),
      damaged: currentComponents.reduce((sum, row) => sum + number(row.damaged_qty), 0),
      prepared: currentComponents.reduce((sum, row) => sum + number(row.prepared_qty), 0),
      missing: currentComponents.reduce((sum, row) => sum + Math.max(0, number(row.planned_qty) - number(row.received_qty)), 0),
      usableShortage: currentComponents.reduce((sum, row) => sum + Math.max(0, number(row.planned_qty) - number(row.received_qty) + number(row.damaged_qty)), 0),
      packed: lines.reduce((sum, row) => sum + number(row.packed_qty), 0),
      grossDelivered: grossSignedQty,
      returned: returnedQty,
      delivered: grossSignedQty-returnedQty,
    } : null;
    const latestDelivery = signed.map(row => row.delivered_at).filter(Boolean).sort().at(-1) || null;
    const current = closed ? "final_closing" : activeStage.key;
    const currentTitle = closed ? "Final School Closing" : activeStage.title;
    const verifiedClosing = CLOSING_CHECKS.filter(check => currentClosing.some(row => row.check_key === check.key && row.status === "verified")).length;
    const technicalDone = TECHNICAL_CHECKPOINTS.filter(check => currentCheckpoints.some(row => row.milestone_key === check.key && row.status === "completed")).length;
    const issuesOpen = openIssues.length;
    const discrepancy = Boolean(quantities && (quantities.usableShortage > 0 || quantities.planned !== quantities.delivered) && complete.has("delivery_closing"));
    const anomalies = [];
    if (stageClosed !== approved) anomalies.push("Closing stage/approval mismatch");
    if (discrepancy) anomalies.push("Delivery quantities need review");
    const blocked = stageStatus === "blocked" || currentCheckpoints.some(row => row.status === "blocked") || currentClosing.some(row => row.status === "blocked");
    const phase = closed ? "closed" : blocked ? "blocked" : !complete.has("delivery_closing") ? "preparing" : complete.has("testing") ? "closing" : "technical";
    return {
      id, name: school.beneficiary_name, schoolLabel: school.school_label || "", proposal: school.proposal_name,
      phase, stageKey: current, stageTitle: currentTitle, stageStatus: closed ? "completed" : stageStatus,
      completedStages: stages.filter(key => complete.has(key)).length, totalStages: stages.length,
      progressPercent: Math.round(stages.filter(key => complete.has(key)).length / stages.length * 100),
      delivered: complete.has("delivery_closing"), closed, approved, blocked,
      quantities, hasManifest, openIssues: issuesOpen, overdueIssues: overdueIssues.length,
      nextIssueDeadline: openIssues.map(row => datePart(row.due_date)).filter(Boolean).sort()[0] || null,
      technicalAccepted: Boolean(acceptance?.confirmation_reference?.trim()),
      technicalChecks: technicalDone, technicalTotal: TECHNICAL_CHECKPOINTS.length,
      verifiedClosing, closingTotal: CLOSING_CHECKS.length,
      shipments: { total: activeShipments.length, draft: activeShipments.filter(row => row.status === "draft").length,
        dispatched: activeShipments.filter(row => row.status === "dispatched").length,
        delivered: activeShipments.filter(row => row.status === "delivered").length, signed: signed.length },
      latestDelivery, anomalies,
    };
  });
  const initial = { planned: 0, received: 0, prepared: 0, damaged: 0, missing: 0, usableShortage: 0, packed: 0, grossDelivered: 0, returned: 0, delivered: 0 };
  const quantityTotals = rows.reduce((sum, row) => {
    for (const key of Object.keys(initial)) sum[key] += row.quantities?.[key] || 0;
    return sum;
  }, { ...initial });
  const summary = {
    totalSchools: rows.length,
    deliveredSchools: rows.filter(row => row.delivered).length,
    closedSchools: rows.filter(row => row.closed).length,
    blockedSchools: rows.filter(row => row.blocked).length,
    technicalFollowupSchools: rows.filter(row => row.delivered && !row.closed).length,
    schoolsWithoutManifest: rows.filter(row => !row.hasManifest).length,
    averageProgress: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.completedStages, 0) / (rows.length * stages.length) * 100) : 0,
    openIssues: rows.reduce((sum, row) => sum + row.openIssues, 0),
    overdueIssues: rows.reduce((sum, row) => sum + row.overdueIssues, 0),
    technicalAcceptedSchools: rows.filter(row => row.technicalAccepted).length,
    inconsistentSchools: rows.filter(row => row.anomalies.length).length,
    quantities: quantityTotals,
  };
  const stageBreakdown = PREPARING_STAGES.map(stage => ({ key: stage.key, title: stage.title,
    count: rows.filter(row => !row.closed && row.stageKey === stage.key).length }));
  return { project: project ? { id: project.id, name: project.name, description: project.description || "" } : null,
    asOfDate: today, summary, stageBreakdown, schools: rows };
}

export function csvField(value) {
  const raw = String(value ?? "");
  // Guard against spreadsheet formula injection, including whitespace-prefixed formulas.
  const safe = /^[\s\u0000-\u001f]*[=+@\-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function csvRows(headings, rows) { return "\uFEFF" + [headings, ...rows].map(row => row.map(csvField).join(",")).join("\r\n"); }

export function internalPreparingCSV(report) {
  const cols = ["School", "Source Proposal", "Status", "Current Stage", "Completed Stages", "Progress %", "Delivery Handover Completed",
    "Planned Qty", "Received Qty", "Damaged Qty", "Usable Shortage", "Prepared Qty", "Packed Qty", "Gross Signed School Qty", "Physical Returns", "Net Accepted School Qty",
    "No BOM Snapshot", "Shipment Count", "Signed Cartons", "Last Delivery", "Open Issues", "Overdue Issues", "Next Issue Deadline",
    "Technical Acceptance", "Closing Checks Verified", "Final Closed", "Data Warnings"];
  return csvRows(cols, report.schools.map(row => [row.name, row.proposal, row.phase, row.stageTitle, `${row.completedStages}/${row.totalStages}`,
    row.progressPercent, row.delivered ? "Yes" : "No", row.quantities?.planned ?? "N/A", row.quantities?.received ?? "N/A",
    row.quantities?.damaged ?? "N/A", row.quantities?.usableShortage ?? "N/A", row.quantities?.prepared ?? "N/A",
    row.quantities?.packed ?? "N/A", row.quantities?.grossDelivered ?? "N/A", row.quantities?.returned ?? "N/A", row.quantities?.delivered ?? "N/A", row.hasManifest ? "No" : "Yes",
    row.shipments.total, row.shipments.signed, row.latestDelivery || "", row.openIssues, row.overdueIssues,
    row.nextIssueDeadline || "", row.technicalAccepted ? "Yes" : "No", `${row.verifiedClosing}/${row.closingTotal}`,
    row.closed ? "Yes" : "No", row.anomalies.join("; ") ]));
}
export function ministryStatusCSV(report) {
  // Informational Ministry report, NOT internal final closure or a machine condition certificate.
  return csvRows(["School", "Proposal", "Delivery/Handover Status", "Latest Recorded Delivery", "Technical Installation Status",
    "Technical Acceptance Recorded", "Open Technical Issues", "Resolved Status", "Machine Condition", "Internal Closing Status"],
  report.schools.map(row => [row.name, row.proposal, row.delivered ? "Handover stage completed" : "Handover pending",
    row.latestDelivery || "", row.technicalChecks === row.technicalTotal ? "Technical checklist complete" : `${row.technicalChecks}/${row.technicalTotal} checks complete`,
    row.technicalAccepted ? "Yes" : "No", row.openIssues, row.openIssues ? "Pending issue resolution" : "No open issues recorded",
    "Not separately assessed in ERP", row.closed ? "Internally closed" : "Internal follow-up ongoing"]));
}
