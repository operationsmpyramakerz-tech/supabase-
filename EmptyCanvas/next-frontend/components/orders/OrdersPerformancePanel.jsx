"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ORDERS_PERF_EVENT, ORDERS_PERF_TOGGLE_EVENT, ordersPerfEnabled, setOrdersPerfEnabled } from "./orderOpeningPerformance";

const round = (value) => (typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)} ms` : "—");

// User-controlled diagnostics; read-only, short lived and anonymous.
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
      setEntries((current) => [entry, ...current].slice(0, 12));
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
            {latestOpen?.failed && <div className="orders-perf-panel__error">Last opening failed.</div>}
            {latestFetch?.serverTiming && <details className="orders-perf-panel__server"><summary>Server breakdown</summary><div>{latestFetch.serverTiming}</div></details>}
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
