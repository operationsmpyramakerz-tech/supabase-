"use client";

import { useEffect, useState } from "react";
import { ORDERS_PERF_EVENT, ordersPerfEnabled } from "./orderOpeningPerformance";

const round = (value) => (typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)} ms` : "—");

// Only displayed with ?ordersPerf=1. Useful on Android devices without DevTools;
// no order identifiers, usernames or request/response bodies are collected.
export default function OrdersPerformancePanel() {
  const [enabled, setEnabled] = useState(false);
  const [entries, setEntries] = useState([]);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const active = ordersPerfEnabled();
    setEnabled(active);
    if (!active) return undefined;
    const handle = (event) => {
      const entry = event.detail;
      if (!entry || (entry.kind !== "open" && entry.kind !== "fetch")) return;
      setEntries((current) => [entry, ...current].slice(0, 5));
      setCopied(false);
    };
    window.addEventListener(ORDERS_PERF_EVENT, handle);
    return () => window.removeEventListener(ORDERS_PERF_EVENT, handle);
  }, []);
  if (!enabled) return null;

  const latestOpen = entries.find((item) => item.kind === "open");
  const latestFetch = entries.find((item) => item.kind === "fetch");
  const details = [
    ["Data + code ready", round(latestOpen?.readyMs)],
    ["Details", round(latestOpen?.detailsMs)],
    ["Modal code", round(latestOpen?.modalMs)],
    ["Last API network", round(latestFetch?.networkMs)],
    ["JSON parsing", round(latestFetch?.parseMs)],
    ["Grouping", round(latestFetch?.groupMs)],
  ];
  return (
    <aside aria-label="Orders performance diagnostics" style={{
      position: "fixed", right: 12, bottom: 84, zIndex: 9500, width: "min(278px, calc(100vw - 24px))",
      maxHeight: "55vh", overflowY: "auto", padding: "12px", borderRadius: 14,
      background: "#17191e", color: "#fff", boxShadow: "0 8px 32px rgba(0,0,0,.28)",
      fontSize: 12, lineHeight: 1.4, direction: "ltr",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>Orders timing</strong>
        <button type="button" onClick={() => setEntries([])} style={{ background: "transparent", border: 0, color: "#ffa45c", cursor: "pointer" }}>Clear</button>
      </div>
      {entries.length ? <>
        {details.map(([label, value]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 3 }}>
            <span style={{ color: "#b7bbc6" }}>{label}</span><strong>{value}</strong>
          </div>
        ))}
        {latestOpen?.failed && <p style={{ color: "#ffb4b4" }}>The most recent opening failed.</p>}
        {latestFetch?.serverTiming && <details style={{ marginTop: 8 }}><summary>Last fetched server stages</summary>
          <div style={{ wordBreak: "break-word", marginTop: 5, color: "#b7bbc6" }}>{latestFetch.serverTiming}</div>
        </details>}
        <button type="button" onClick={() => {
          const anonymousMetrics = entries.map((entry) => ({ ...entry }));
          void navigator.clipboard?.writeText(JSON.stringify(anonymousMetrics, null, 2)).then(() => setCopied(true)).catch(() => {});
        }} style={{ marginTop: 10, background: "#f97316", color: "#fff", border: 0, borderRadius: 8, padding: "7px 10px", cursor: "pointer", width: "100%" }}>
          {copied ? "Copied timings" : "Copy timings"}
        </button>
      </> : <span style={{ color: "#b7bbc6" }}>Open an order to measure the loading stages.</span>}
    </aside>
  );
}
