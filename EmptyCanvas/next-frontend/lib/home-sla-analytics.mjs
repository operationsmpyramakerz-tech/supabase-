/**
 * Optional, policy-driven SLA monitoring based strictly on recorded lifecycle events.
 * No configured policy = no compliance or breach claims. Calendar-hours only.
 * No side-effects, notifications, or historical inference.
 */
import { auditedOrderTimeline } from './home-lifecycle-analytics.mjs';

const HOUR_MS = 3_600_000;
const STAGES = {
  current: { label: 'Request to completion', from: 'createdAt', to: 'completedAt' },
  review: { label: 'Request to approval', from: 'createdAt', to: 'approvedAt' },
  operations: { label: 'Approval to delivery', from: 'approvedAt', to: 'completedAt' },
  maintenance: { label: 'Approval to completion', from: 'approvedAt', to: 'completedAt' },
};

function policyFor(row) {
  if (!row || row.enabled !== true) return null;
  const targetHours = Number(row.target_hours ?? row.targetHours);
  const warningPercent = Number(row.warning_percent ?? row.warningPercent ?? 80);
  if (!Number.isFinite(targetHours) || targetHours <= 0 || targetHours > 8760 ||
      !Number.isFinite(warningPercent) || warningPercent < 50 || warningPercent >= 100) return null;
  return { targetHours, warningPercent };
}

export function buildSlaAnalytics(scopes = {}, events = [], policies = [], now = Date.now()) {
  const currentTime = Number(now);
  const byOrder = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    const key = String(event?.order_number ?? event?.orderNumber ?? '').trim();
    if (!byOrder.has(key)) byOrder.set(key, []);
    byOrder.get(key).push(event);
  }
  const policyMap = new Map((Array.isArray(policies) ? policies : []).map((row) => [row.workspace, row]));
  const workspaces = {};
  for (const [workspace, stage] of Object.entries(STAGES)) {
    const scope = Array.isArray(scopes[workspace]) ? scopes[workspace] : [];
    const policy = policyFor(policyMap.get(workspace));
    const metrics = {
      ...stage, configured: !!policy, targetHours: policy?.targetHours ?? null,
      warningPercent: policy?.warningPercent ?? null, eligible: scope.length, audited: 0,
      awaitingStart: 0, activeOnTrack: 0, activeWarning: 0, activeOverdue: 0,
      completedOnTime: 0, completedLate: 0, topOverdue: [],
    };
    // Without a policy these values are not meaningful; do not call orders late.
    if (!policy) { workspaces[workspace] = metrics; continue; }
    for (const order of scope) {
      const key = String(order.orderNumber ?? '').trim();
      const expected = Number(order.expectedRows);
      if (!Number.isSafeInteger(expected) || expected <= 0) continue;
      const timeline = auditedOrderTimeline(byOrder.get(key) || [], expected);
      if (!timeline) continue;
      metrics.audited++;
      const start = timeline[stage.from];
      const end = timeline[stage.to];
      if (!Number.isFinite(start) || start > currentTime) { metrics.awaitingStart++; continue; }
      // An inconsistent event sequence is unverified, never counted as compliant.
      if (end !== null && (!Number.isFinite(end) || end < start || end > currentTime)) continue;
      const elapsedHours = ((end ?? currentTime) - start) / HOUR_MS;
      if (end !== null) {
        if (elapsedHours <= policy.targetHours) metrics.completedOnTime++;
        else metrics.completedLate++;
      } else if (elapsedHours > policy.targetHours) {
        metrics.activeOverdue++;
        metrics.topOverdue.push({ orderNumber: key, elapsedHours: Math.round(elapsedHours * 10) / 10 });
      } else if (elapsedHours >= policy.targetHours * policy.warningPercent / 100) {
        metrics.activeWarning++;
      } else {
        metrics.activeOnTrack++;
      }
    }
    metrics.topOverdue.sort((a, b) => b.elapsedHours - a.elapsedHours || a.orderNumber.localeCompare(b.orderNumber));
    metrics.topOverdue = metrics.topOverdue.slice(0, 5);
    metrics.untracked = metrics.eligible - metrics.audited;
    metrics.completionSample = metrics.completedOnTime + metrics.completedLate;
    metrics.onTimePercent = metrics.completionSample
      ? Math.round(metrics.completedOnTime / metrics.completionSample * 100) : null;
    workspaces[workspace] = metrics;
  }
  return { state: 'ready', measuredAt: Number.isFinite(currentTime) ? new Date(currentTime).toISOString() : null, workspaces };
}
