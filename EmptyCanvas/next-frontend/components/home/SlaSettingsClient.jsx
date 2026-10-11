'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const WORKSPACES = [
  ['current', 'Current orders'], ['review', 'Orders review'],
  ['operations', 'Operations orders'], ['maintenance', 'Maintenance orders'],
];
const DAYS = [['Sun', 0], ['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6]];
const DEFAULT_CALENDAR = { enabled: false, timezone: 'Africa/Cairo', work_days: [0, 1, 2, 3, 4], work_start: '09:00', work_end: '17:00', holidays: [] };
const DEFAULT_POLICY = (workspace) => ({ workspace, enabled: false, target_hours: '', warning_percent: 80, time_basis: 'elapsed' });

function PolicyCard({ value, onChange, onSave, busy, calendarEnabled }) {
  const update = (patch) => onChange(value.workspace, { ...value, ...patch });
  const isWorking = value.time_basis === 'working';
  return <section className="sla-editor-card">
    <div className="sla-editor-card__head"><div><span>WORKFLOW</span><h3>{WORKSPACES.find(([key]) => key === value.workspace)?.[1]}</h3></div>
      <label className="sla-editor-switch"><input type="checkbox" checked={Boolean(value.enabled)} onChange={e => update({ enabled: e.target.checked })}/><span>{value.enabled ? 'Enabled' : 'Disabled'}</span></label></div>
    <div className="sla-editor-fields">
      <label>Target hours<input type="number" step="0.25" min="0.01" max="8760" value={value.target_hours ?? ''} onChange={e => update({ target_hours: e.target.value })} placeholder="Not configured"/></label>
      <label>Warning threshold (%)<input type="number" min="50" max="99" step="1" value={value.warning_percent ?? 80} onChange={e => update({ warning_percent: e.target.value })}/></label>
      <label>Time calculation<select value={value.time_basis || 'elapsed'} onChange={e => update({ time_basis: e.target.value })}><option value="elapsed">Continuous calendar hours</option><option value="working">Approved working hours only</option></select></label>
    </div>
    {isWorking && !calendarEnabled ? <p className="sla-editor-warning">Enable and save the company calendar before enabling this working-hours policy. Without it the dashboard will not judge compliance.</p> : null}
    <div className="sla-editor-card__footer"><small>Nothing changes until you save this workflow.</small><button type="button" disabled={busy} onClick={() => onSave(value.workspace)}>Save policy</button></div>
  </section>;
}

export default function SlaSettingsClient() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [policies, setPolicies] = useState({});
  const [calendar, setCalendar] = useState(DEFAULT_CALENDAR);
  const [holidaysText, setHolidaysText] = useState('');
  const [message, setMessage] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/next/api/home/sla-settings', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to load settings.');
      const byWorkspace = Object.fromEntries(WORKSPACES.map(([key]) => [key, DEFAULT_POLICY(key)]));
      for (const row of data.policies || []) if (byWorkspace[row.workspace]) byWorkspace[row.workspace] = { ...byWorkspace[row.workspace], ...row };
      setPolicies(byWorkspace);
      const cal = data.calendar || DEFAULT_CALENDAR;
      setCalendar({ ...DEFAULT_CALENDAR, ...cal });
      setHolidaysText((cal.holidays || []).join('\n'));
      setMessage(null);
    } catch (error) { setMessage({ error: true, text: error.message }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (type, data, key) => {
    setBusy(key); setMessage(null);
    try {
      const res = await fetch('/next/api/home/sla-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, data }) });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || 'Could not save.');
      if (type === 'calendar') setCalendar(previous => ({ ...previous, ...body.saved }));
      else setPolicies(previous => ({ ...previous, [key]: { ...previous[key], ...body.saved } }));
      setMessage({ error: false, text: `${type === 'calendar' ? 'Working calendar' : 'SLA policy'} saved. Refresh Home to see updated analysis.` });
    } catch (error) { setMessage({ error: true, text: error.message }); }
    finally { setBusy(''); }
  };
  const saveCalendar = () => {
    const holidays = holidaysText.split(/[\n,;\s]+/).map(x => x.trim()).filter(Boolean);
    save('calendar', { ...calendar, holidays }, 'calendar');
  };
  const updatePolicy = (key, next) => setPolicies(previous => ({ ...previous, [key]: next }));

  return <main className="sla-editor">
    <header className="sla-editor-hero"><Link href="/home" className="sla-editor-back">← Home</Link><span>OPERATIONS ANALYTICS</span><h1>SLA management</h1><p>Set optional time targets and the approved company working calendar. These settings affect dashboard reporting only; no notifications, forced channels, or escalations are created.</p></header>
    {message ? <div role="status" className={`sla-editor-message ${message.error ? 'is-error' : 'is-success'}`}>{message.text}</div> : null}
    {loading ? <div className="sla-editor-loading">Loading saved settings…</div> : <>
      <div className="sla-editor-section-head"><div><span>01 / COMPANY CALENDAR</span><h2>Working days & holidays</h2><p>The calendar starts disabled. The displayed schedule is only a starting example; verify it before enabling.</p></div></div>
      <section className="sla-editor-card sla-editor-card--wide">
        <div className="sla-editor-card__head"><h3>Company working calendar</h3><label className="sla-editor-switch"><input type="checkbox" checked={Boolean(calendar.enabled)} onChange={e => setCalendar(c => ({ ...c, enabled: e.target.checked }))}/><span>{calendar.enabled ? 'Enabled' : 'Disabled'}</span></label></div>
        <div className="sla-editor-fields"><label>Timezone<select value={calendar.timezone} onChange={e => setCalendar(c => ({ ...c, timezone: e.target.value }))}><option value="Africa/Cairo">Cairo (Egypt)</option><option value="Asia/Riyadh">Riyadh</option><option value="Asia/Dubai">Dubai</option><option value="UTC">UTC</option></select></label><label>From<input type="time" value={calendar.work_start} onChange={e => setCalendar(c => ({ ...c, work_start: e.target.value }))}/></label><label>To<input type="time" value={calendar.work_end} onChange={e => setCalendar(c => ({ ...c, work_end: e.target.value }))}/></label></div>
        <div className="sla-editor-subsection"><strong>Working days</strong><div className="sla-editor-days">{DAYS.map(([name, number]) => <label key={number} className={calendar.work_days.includes(number) ? 'is-active' : ''}><input type="checkbox" checked={calendar.work_days.includes(number)} onChange={e => setCalendar(c => ({ ...c, work_days: e.target.checked ? [...c.work_days, number] : c.work_days.filter(x => x !== number) }))}/>{name}</label>)}</div></div>
        <label className="sla-editor-holidays">Holidays (one YYYY-MM-DD date per line)<textarea rows={4} value={holidaysText} onChange={e => setHolidaysText(e.target.value)} placeholder="2026-01-07"/><small>Days listed here are excluded completely. Holidays are not fetched automatically; maintain this list explicitly.</small></label>
        <div className="sla-editor-card__footer"><small>The calendar affects only policies switched to working hours.</small><button type="button" disabled={!!busy} onClick={saveCalendar}>{busy === 'calendar' ? 'Saving…' : 'Save calendar'}</button></div>
      </section>
      <div className="sla-editor-section-head"><div><span>02 / WORKFLOW TARGETS</span><h2>Policies by workspace</h2><p>Each workflow can have its own approved target, warning threshold and time basis.</p></div></div>
      <div className="sla-editor-policy-grid">{WORKSPACES.map(([key]) => <PolicyCard key={key} value={policies[key] || DEFAULT_POLICY(key)} onChange={updatePolicy} busy={!!busy} calendarEnabled={Boolean(calendar.enabled)} onSave={workspace => save('policy', policies[workspace], workspace)} />)}</div>
      <p className="sla-editor-note">Only orders with a complete verified lifecycle history are evaluated. A disabled policy never labels orders as overdue. Processing Time metrics elsewhere on Home still use continuous calendar hours.</p>
    </>}
  </main>;
}
