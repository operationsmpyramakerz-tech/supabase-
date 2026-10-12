"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ORDERS_PERF_EVENT, ORDERS_PERF_TOGGLE_EVENT, ordersPerfEnabled, setOrdersPerfEnabled } from "./orderOpeningPerformance";
import { computeRecentOrderSpeed, MAIN_STAGE_LABELS, parseServerTiming, SQL_STAGE_LABELS } from "./ordersPerfAnalysis";

const round = (value) => (typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)} ms` : "—");
const readableSize = (bytes) => (typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0
  ? `${(bytes / 1024).toFixed(1)} KiB` : "—");

function TimingsRows({ entries, values }) {
  return entries.filter(([key]) => Number.isFinite(values[key])).map(([key, label]) => (
    <div className="orders-perf-panel__metric" key={key}><span>{label}</span><strong>{round(values[key])}</strong></div>
  ));
}

// User-controlled diagnostics. All history is ephemeral and anonymous.
export default function OrdersPerformancePanel() {
  const [mounted, setMounted] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [entries, setEntries] = useState([]);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    setMounted(true);
    const sync = () => { setEnabled(ordersPerfEnabled()); setCopyStatus(""); };
    sync();
    const handle = (event) => {
      const entry = event.detail;
      if (!entry || !["open", "fetch", "paint"].includes(entry.kind)) return;
      // Five complete opens = 15 events; leave room for failures and prefetches.
      setEntries((current) => [entry, ...current].slice(0, 24));
      setCopyStatus("");
    };
    window.addEventListener(ORDERS_PERF_EVENT, handle);
    window.addEventListener(ORDERS_PERF_TOGGLE_EVENT, sync);
    return () => {
      window.removeEventListener(ORDERS_PERF_EVENT, handle);
      window.removeEventListener(ORDERS_PERF_TOGGLE_EVENT, sync);
    };
  }, []);

  if (!mounted || !enabled) return null;

  const latestOpen = entries.find((item) => item.kind === "open");
  const latestFetch = entries.find((item) => item.kind === "fetch");
  const latestPaint = entries.find((item) => item.kind === "paint");
  const server = parseServerTiming(latestFetch?.serverTiming);
  const recent = computeRecentOrderSpeed(entries);
  const sqlStages = SQL_STAGE_LABELS.filter(([name]) => Number.isFinite(server[name]));
  const sqlMeasured = sqlStages.reduce((total, [name]) => total + server[name], 0);
  const details = [
    ["Click → visible", round(latestPaint?.visibleMs)],
    ["Data + code ready", round(latestOpen?.readyMs)],
    ["Order details", round(latestOpen?.detailsMs)],
    ["Modal code", round(latestOpen?.modalMs)],
    ["API response", round(latestFetch?.networkMs)],
    ["JSON parsing", round(latestFetch?.parseMs)],
    ["Grouping", round(latestFetch?.groupMs)],
  ];
  const copyTimings = async () => {
    try {
      if (typeof navigator.clipboard?.writeText !== "function") throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
      setCopyStatus("Copied!");
    } catch {
      setCopyStatus("Copy not available on this browser");
    }
  };

  return createPortal(
    <aside className={`orders-perf-panel ${minimized ? "is-minimized" : ""}`} aria-label="Orders performance diagnostics">
      <div className="orders-perf-panel__head">
        <span className="orders-perf-panel__title">Order speed <span className="orders-perf-panel__live">LIVE</span></span>
        <div className="orders-perf-panel__head-actions">
          <button type="button" title={minimized ? "Expand" : "Minimize"} aria-label={minimized ? "Expand timing panel" : "Minimize timing panel"} onClick={() => setMinimized((value) => !value)}>{minimized ? "+" : "−"}</button>
          <button type="button" title="Hide speed measurements" aria-label="Close timing panel" onClick={() => setOrdersPerfEnabled(false)}>×</button>
        </div>
      </div>
      {!minimized && (
        <div className="orders-perf-panel__content">
          {entries.length ? <>
            {details.map(([label, value]) => (
              <div className="orders-perf-panel__metric" key={label}><span>{label}</span><strong>{value}</strong></div>
            ))}
            {recent && recent.count > 1 && (
              <div className="orders-perf-panel__summary" aria-label="Recent opening speeds">
                <span>Median of last {recent.count} opens</span><strong>{round(recent.medianMs)}</strong>
                <small>Fastest {round(recent.fastestMs)} · Slowest {round(recent.slowestMs)}</small>
              </div>
            )}
            {latestOpen?.failed && <div className="orders-perf-panel__error">Last opening failed.</div>}
            {latestFetch?.serverTiming && <details className="orders-perf-panel__server">
              <summary>Server breakdown</summary>
              <div className="orders-perf-panel__breakdown">
                <TimingsRows entries={MAIN_STAGE_LABELS} values={server}/>
                {Number.isFinite(latestFetch?.bundleBytes) && <div className="orders-perf-panel__metric"><span>Bundle JSON size (before compression)</span><strong>{readableSize(latestFetch.bundleBytes)}</strong></div>}
                {latestFetch?.serverRegion && <div className="orders-perf-panel__metric"><span>Vercel region</span><strong>{latestFetch.serverRegion}</strong></div>}
                {Number.isFinite(server.bundleHeaders) && <p className="orders-perf-panel__note">Waiting for headers includes the Supabase network connection and remote processing; it is not PostgreSQL query time alone. Body and JSON timings are measured on the Vercel server.</p>}
                {Number.isFinite(server.bundleCompact) && <div className="orders-perf-panel__metric"><span>Compact bundle transport</span><strong>{server.bundleCompact === 1 ? "Active" : "Legacy"}</strong></div>}
                {Number.isFinite(server.bundleCompactFallback) && server.bundleCompactFallback === 1 && <p className="orders-perf-panel__note">Compact format unavailable or incompatible; reverted safely to the original full-data RPC.</p>}
                {Number.isFinite(server.fastPath) && <div className="orders-perf-panel__metric"><span>Database fast path</span><strong>{server.fastPath === 1 ? "Active" : "Fallback"}</strong></div>}
                {sqlStages.length > 0 && <details className="orders-perf-panel__sql">
                  <summary>PostgreSQL query stages ({round(sqlMeasured)})</summary>
                  <TimingsRows entries={SQL_STAGE_LABELS} values={server}/>
                  {Number.isFinite(server.bundle) && <p className="orders-perf-panel__note">Bundle time includes database access, response transfer and other work. SQL stages are a subset, not additional time.</p>}
                </details>}
                {Number.isFinite(server.bundleProposalScanSkipped) && <div className="orders-perf-panel__metric"><span>Proposal scan</span><strong>{server.bundleProposalScanSkipped === 1 ? "Skipped" : "Required"}</strong></div>}
                <details className="orders-perf-panel__raw"><summary>Raw timings</summary><code>{latestFetch.serverTiming}</code></details>
              </div>
            </details>}
            <div className="orders-perf-panel__actions">
              <button type="button" onClick={() => { setEntries([]); setCopyStatus(""); }}>Clear</button>
              <button type="button" onClick={copyTimings}>Copy timings</button>
            </div>
            {copyStatus && <div className="orders-perf-panel__copy" role="status">{copyStatus}</div>}
          </> : <div className="orders-perf-panel__empty">Now open an order to measure its loading speed.</div>}
          <div className="orders-perf-panel__hint">Measurements stay on this device. No order details are recorded.</div>
        </div>
      )}
    </aside>,
    document.body,
  );
}
