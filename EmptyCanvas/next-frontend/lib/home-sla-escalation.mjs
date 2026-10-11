/** Pure, fail-closed checks for supervisor SLA escalation. */
export const SLA_ESCALATION_PAGES = {
  current: ['Current Orders'], review: ['Orders Review'],
  operations: ['Operations Orders', 'Requested Orders'], maintenance: ['Maintenance Orders'],
};
const canonical = (value) => String(value || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
export function hasSupervisorAccess(user, workspace) {
  const aliases = SLA_ESCALATION_PAGES[workspace] || [];
  // Never infer privileged access from someone's name or position.
  const granted = new Set((user?.adminPages || []).map(canonical));
  return aliases.some(name => granted.has(canonical(name)));
}
export function canEscalateSla({ alert, ownerId, recipientId, route, owner, recipient, ownerSettings, recipientSettings } = {}) {
  if (!route || route.enabled !== true || !alert || alert.kind !== 'overdue') return false;
  if (String(route.owner_id) !== String(ownerId) || String(route.supervisor_id) !== String(recipientId) ||
      String(route.workspace) !== String(alert.workspace) || String(ownerId) === String(recipientId)) return false;
  const ownerPages = new Set((owner?.allowedPages || []).map(canonical));
  const ownsWorkspace = (SLA_ESCALATION_PAGES[alert.workspace] || []).some(page => ownerPages.has(canonical(page)));
  if (!owner || !ownsWorkspace || !recipient || !hasSupervisorAccess(recipient, alert.workspace)) return false;
  if (!Number.isFinite(alert.usedHours) || !Number.isFinite(alert.targetHours) ||
      alert.usedHours < alert.targetHours + 24) return false;
  if (ownerSettings?.sla_alerts?.share_escalation !== true ||
      recipientSettings?.sla_alerts?.receive_escalation !== true) return false;
  const channels = recipientSettings?.channels?.sla || {};
  return channels.in_app === true || channels.push === true || channels.email === true;
}
export function escalationKey(recipientId, ownerId, alertKey) {
  return `supervisor:${String(recipientId)}:${String(ownerId)}:${String(alertKey)}`;
}
