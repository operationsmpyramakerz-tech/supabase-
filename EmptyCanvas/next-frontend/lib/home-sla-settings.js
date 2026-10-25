import 'server-only';
import { select, supabaseRequest } from './supabase-rest';
import { directPageAccessLevel } from './order-action-auth';
import { featureAllowed } from './feature-permissions-registry';

const ADMIN_PAGES = ['Users Center', 'User Access & Data', 'User Access', 'Team Members'];
export const SLA_WORKSPACES = ['current', 'review', 'operations', 'maintenance'];
function slaAdvanced(account) {
  return account?.featureAccess?.mode === 'enforced' && Object.hasOwn(account?.featureAccess?.grants || {}, 'sla.view');
}
export function canViewSla(account) {
  return slaAdvanced(account) ? featureAllowed(account, 'sla.view') : directPageAccessLevel(account || {}, ADMIN_PAGES) === 'admin';
}
export function canManageSla(account) {
  const previousAccess = slaAdvanced(account)
    ? featureAllowed(account, 'sla.manage')
    : directPageAccessLevel(account || {}, ADMIN_PAGES) === 'admin';
  // Preserve the older SLA admin prerequisite even if the new Home toggle is
  // enabled. A new allow never upgrades a View-only user to SLA administrator.
  return previousAccess && featureAllowed(account, 'home.sla_manage');
}

export async function readSlaSettings() {
  const [policies, calendars] = await Promise.all([
    select('erp_home_sla_policies', { select: 'workspace,enabled,target_hours,warning_percent,time_basis', order: 'workspace.asc', limit: '4' }),
    select('erp_home_sla_calendar', { select: 'id,enabled,timezone,work_days,work_start,work_end,holidays', id: 'eq.company', limit: '1' }),
  ]);
  return { policies: Array.isArray(policies) ? policies : [], calendar: calendars?.[0] || null };
}

function validClock(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || ''); }
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === value;
}
function invalid(message) { const error = new Error(message); error.status = 400; throw error; }

export function validateSlaPolicy(input) {
  if (!SLA_WORKSPACES.includes(input?.workspace)) invalid('Invalid workflow.');
  if (typeof input.enabled !== 'boolean') invalid('Enable must be true or false.');
  const target = input.target_hours === '' || input.target_hours === null || input.target_hours === undefined ? null : Number(input.target_hours);
  if ((input.enabled && target === null) || (target !== null && (!Number.isFinite(target) || target <= 0 || target > 8760 || Math.round(target * 100) !== target * 100))) invalid('Enter a target between 0.01 and 8760 hours (up to 2 decimals).');
  const warn = Number(input.warning_percent);
  if (!Number.isInteger(warn) || warn < 50 || warn > 99) invalid('Warning threshold must be 50–99%.');
  if (!['elapsed', 'working'].includes(input.time_basis)) invalid('Invalid time basis.');
  return { enabled: input.enabled, target_hours: target, warning_percent: warn, time_basis: input.time_basis, updated_at: new Date().toISOString() };
}

export function validateSlaCalendar(input) {
  if (typeof input?.enabled !== 'boolean') invalid('Calendar enable must be true or false.');
  const zone = String(input.timezone || '').trim();
  // Supported operating regions; arbitrary user-defined IANA zones are not necessary yet.
  if (!['Africa/Cairo', 'UTC', 'Asia/Riyadh', 'Asia/Dubai'].includes(zone)) invalid('Choose a supported timezone.');
  const days = input.work_days;
  if (!Array.isArray(days) || !days.length || days.length > 7 ||
      days.some(v => !Number.isInteger(v) || v < 0 || v > 6) || new Set(days).size !== days.length) invalid('Choose one or more unique working days.');
  if (!validClock(input.work_start) || !validClock(input.work_end) || input.work_end <= input.work_start) invalid('Working hours must be valid and end after start (no overnight shifts).');
  const holidayRows = input.holidays;
  if (!Array.isArray(holidayRows) || holidayRows.length > 150 || holidayRows.some(v => typeof v !== 'string' || !validDate(v)) || new Set(holidayRows).size !== holidayRows.length) invalid('Enter up to 150 unique holidays as YYYY-MM-DD.');
  return { enabled: input.enabled, timezone: zone, work_days: [...days].sort((a, b) => a - b),
    work_start: input.work_start, work_end: input.work_end, holidays: holidayRows.slice().sort(), updated_at: new Date().toISOString() };
}

export async function saveSlaSetting(type, input) {
  const isPolicy = type === 'policy';
  if (!isPolicy && type !== 'calendar') invalid('Unknown setting type.');
  const data = isPolicy ? validateSlaPolicy(input) : validateSlaCalendar(input);
  if (isPolicy && data.enabled && data.time_basis === 'working') {
    const rows = await select('erp_home_sla_calendar', { select: 'enabled', id: 'eq.company', limit: '1' });
    if (rows?.[0]?.enabled !== true) invalid('Enable and save the company work calendar before enabling a working-hours SLA.');
  }
  const table = isPolicy ? 'erp_home_sla_policies' : 'erp_home_sla_calendar';
  const selector = isPolicy ? `workspace=eq.${encodeURIComponent(input.workspace)}` : 'id=eq.company';
  const rows = await supabaseRequest(`/${table}?${selector}`, {
    method: 'PATCH', body: data, headers: { Prefer: 'return=representation' },
  });
  if (!Array.isArray(rows) || rows.length !== 1) throw Object.assign(new Error('Configuration row not found. Run the phase 6 SQL migration.'), { status: 503 });
  return rows[0];
}
