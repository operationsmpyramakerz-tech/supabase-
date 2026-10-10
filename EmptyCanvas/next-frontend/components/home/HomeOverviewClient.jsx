"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ExpensesCard } from "./DashboardCards";

function money(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function Icon({ name, className = "" }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    className,
  };
  const paths = {
    activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
    "chevron-down": <polyline points="6 9 12 15 18 9" />,
    check: <polyline points="20 6 9 17 4 12" />,
    box: <><path d="m3 7 9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/></>,
    file: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    tool: <path d="M20.5 7.5a5 5 0 0 1-6.6 6.6l-7.1 7.1a2 2 0 0 1-2.8-2.8l7.1-7.1a5 5 0 0 1 6.6-6.6l-3 3 2.8 2.8 3-3Z"/>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    alert: <><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17h.01"/></>,
    chart: <><path d="M4 20V13M10 20V8M16 20V4M22 20v-9"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4"/></>,
  };
  return <svg {...common}>{paths[name] || paths.activity}</svg>;
}

function useOutsideClose(ref, close) {
  useEffect(() => {
    const onPointerDown = (event) => {
      if (!ref.current || ref.current.contains(event.target)) return;
      close();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ref, close]);
}

const DASHBOARD_WORKSPACES = [
  { key: "current", title: "Current orders", shortTitle: "Current", description: "Track the status of your requests", href: "/next/orders", icon: "box" },
  { key: "review", title: "Orders review", shortTitle: "Review", description: "Review and approval progress", href: "/next/orders-review", icon: "file" },
  { key: "operations", title: "Operations orders", shortTitle: "Operations", description: "Follow up on operations delivery", href: "/next/operations-orders", icon: "chart" },
  { key: "maintenance", title: "Maintenance orders", shortTitle: "Maintenance", description: "Repairs and maintenance progress", href: "/next/maintenance-orders", icon: "tool" },
];

function toRouterPath(href) {
  const raw = String(href || "/");
  if (raw === "/next") return "/";
  if (raw.startsWith("/next/")) return raw.slice(5) || "/";
  return raw;
}

function compactMoney(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "EGP 0";
  const absolute = Math.abs(amount);
  if (absolute < 10_000) return `EGP ${amount.toLocaleString("en-EG", { maximumFractionDigits: 0 })}`;
  if (absolute >= 1_000_000) {
    const digits = absolute < 10_000_000 ? 2 : 1;
    return `EGP ${(amount / 1_000_000).toFixed(digits).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}M`;
  }
  const digits = absolute < 100_000 ? 1 : 0;
  return `EGP ${(amount / 1_000).toFixed(digits).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}K`;
}

function safeStatus(matrix) {
  return matrix?.status?.all || { total: 0, totalCost: 0, buckets: [] };
}

function MiniDistribution({ summary, name }) {
  const buckets = Array.isArray(summary?.buckets) ? summary.buckets : [];
  const total = Math.max(0, Number(summary?.total || 0));
  return (
    <div className="erp-home-distribution" role="img" aria-label={`${name}: ${buckets.map((item) => `${item.label} ${item.count}`).join(", ") || "No orders"}`}>
      {total ? buckets.filter((item) => Number(item.count) > 0).map((item) => (
        <span key={item.key} title={`${item.label}: ${item.count} (${Math.round(Number(item.count || 0) / total * 100)}%)`} style={{ width: `${Number(item.count || 0) / total * 100}%`, backgroundColor: item.color || "#64748b" }} />
      )) : <span className="erp-home-distribution__empty" />}
    </div>
  );
}

function SummaryTile({ definition, summary }) {
  return (
    <Link className={`erp-home-tile erp-home-tile--${definition.key}`} href={toRouterPath(definition.href)}>
      <span className="erp-home-tile__top"><span className="erp-home-tile__icon"><Icon name={definition.icon} /></span><Icon name="arrow" className="erp-home-tile__arrow" /></span>
      <span className="erp-home-tile__title">{definition.shortTitle} orders</span>
      <span className="erp-home-tile__total">{Number(summary.total || 0).toLocaleString("en-EG")}</span>
      <span className="erp-home-tile__value" title={money(summary.totalCost)}>{compactMoney(summary.totalCost)}</span>
      <MiniDistribution summary={summary} name={definition.title} />
    </Link>
  );
}

function OrderOverviewCard({ definition, matrix, statusOnly = false }) {
  const [by, setBy] = useState("status");
  // Time and user scopes are applied server-side by the shared dashboard filter.
  // Keeping the card's analysis mode local avoids applying the time range twice.
  const summary = matrix?.[by]?.all || safeStatus(matrix);
  const buckets = Array.isArray(summary.buckets) ? summary.buckets : [];
  const total = Math.max(0, Number(summary.total || 0));

  return (
    <article className={`erp-home-order-card erp-home-order-card--${definition.key}`} aria-label={`${definition.title} breakdown`}>
      <div className="erp-home-order-card__head">
        <span className="erp-home-order-card__icon"><Icon name={definition.icon}/></span>
        <div className="erp-home-order-card__identity">
          <h3><Link href={toRouterPath(definition.href)}>{definition.title}</Link></h3>
          <p>{definition.description}</p>
        </div>
        <Link className="erp-home-order-card__visit" href={toRouterPath(definition.href)} aria-label={`Open ${definition.title}`}><Icon name="arrow" /></Link>
      </div>
      <div className="erp-home-order-card__figures">
        <div><span>Total orders</span><strong>{total.toLocaleString("en-EG")}</strong></div>
        <div className="erp-home-order-card__amount"><span>Total value</span><strong title={money(summary.totalCost)}>{compactMoney(summary.totalCost)}</strong></div>
      </div>
      <div className="erp-home-order-card__analysis-head">
        <span>Breakdown</span>
        {!statusOnly ? <div className="erp-home-order-card__segmented" aria-label={`${definition.title} analysis`} role="group">
          <button type="button" aria-pressed={by === "status"} className={by === "status" ? "is-active" : ""} onClick={() => setBy("status")}>Status</button>
          <button type="button" aria-pressed={by === "type"} className={by === "type" ? "is-active" : ""} onClick={() => setBy("type")}>Type</button>
        </div> : null}
      </div>
      <MiniDistribution summary={summary} name={definition.title} />
      <div className="erp-home-order-card__status-list">
        {buckets.map((bucket) => {
          const amount = Number(bucket.count || 0);
          const percentage = total ? Math.round((amount / total) * 100) : 0;
          return (
            <div className="erp-home-order-card__status" key={bucket.key}>
              <span className="erp-home-order-card__status-label"><i style={{ backgroundColor: bucket.color || "#64748b" }}/>{bucket.label}</span>
              <span className="erp-home-order-card__status-value" title={money(bucket.cost)}>{compactMoney(bucket.cost)}</span>
              <strong>{amount.toLocaleString("en-EG")}</strong>
              <span className="erp-home-order-card__percentage">{percentage}%</span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function FocusQueue({ workspaces, trendAnalysis = {} }) {
  const focusDefinitions = {
    current: { key: "progress", label: "In progress" },
    review: { key: "pending", label: "Pending review" },
    operations: { key: "pending", label: "Pending operations" },
    maintenance: { key: "pending", label: "Pending maintenance" },
  };
  const entries = workspaces.map(({ definition, matrix }) => {
    const target = focusDefinitions[definition.key];
    const bucket = safeStatus(matrix).buckets?.find((item) => item.key === target.key);
    const aging = trendAnalysis?.[definition.key]?.aging;
    return { ...definition, focusLabel: target.label, count: Number(bucket?.count || 0), aging };
  });
  if (!entries.length) return null;
  return (
    <section className="erp-home-focus" aria-label="Work in progress and pending orders">
      <div className="erp-home-focus__head"><span className="erp-home-focus__icon"><Icon name="clock"/></span><div><h3>Needs follow-up</h3><p>Current status counts across your accessible workspaces</p></div></div>
      <div className="erp-home-focus__items">
        {entries.map((entry) => (
          <Link key={entry.key} href={toRouterPath(entry.href)} className="erp-home-focus__item"><span className="erp-home-focus__item-label">{entry.focusLabel}{Number(entry.aging?.olderThan7Days || 0) > 0 ? <small>{entry.aging.olderThan7Days} created 7+ days ago</small> : null}</span><strong>{entry.count.toLocaleString("en-EG")}</strong><Icon name="arrow" /></Link>
        ))}
      </div>
    </section>
  );
}

function BacklogHealth({ workspaces, backlogAnalysis = {}, selectedDuration = "all" }) {
  const [active, setActive] = useState("current");
  const available = workspaces.filter(({ definition }) => Boolean(backlogAnalysis?.[definition.key]));
  const selected = available.find(({ definition }) => definition.key === active) || available[0];
  if (!selected) return null;
  const data = backlogAnalysis[selected.definition.key];
  const known = Number(data.dated || 0);
  const oldest = Array.isArray(data.oldest) ? data.oldest : [];
  const bands = Array.isArray(data.bands) ? data.bands : [];
  const medianText = data.medianAgeDays === null || data.medianAgeDays === undefined ? "—" : `${data.medianAgeDays}d`;
  const averageText = data.averageAgeDays === null || data.averageAgeDays === undefined ? "—" : `${data.averageAgeDays}d`;

  return (
    <section className="erp-home-backlog" aria-label="Open order age analysis">
      <div className="erp-home-backlog__header">
        <div className="erp-home-backlog__title">
          <span className="erp-home-dashboard__eyebrow"><Icon name="clock"/> OPERATIONAL INSIGHTS</span>
          <h2>Backlog health</h2>
          <p>How long the orders that are still open have been waiting since creation.</p>
        </div>
        <div className="erp-home-backlog__tabs" role="group" aria-label="Backlog workspace">
          {available.map(({ definition }) => (
            <button key={definition.key} type="button" className={selected.definition.key === definition.key ? "is-active" : ""}
              aria-pressed={selected.definition.key === definition.key}
              onClick={() => setActive(definition.key)}>{definition.shortTitle}</button>
          ))}
        </div>
      </div>
      <div className="erp-home-backlog__body">
        <div className="erp-home-backlog__main">
          <div className="erp-home-backlog__kpis">
            <div><span>Open orders</span><strong>{Number(data.open || 0).toLocaleString("en-EG")}</strong></div>
            <div><span>Median age</span><strong>{medianText}</strong></div>
            <div><span>Average age</span><strong>{averageText}</strong></div>
            <div className="erp-home-backlog__kpi--alert"><span>Created 14+ days ago</span><strong>{Number(data.fourteenPlus || 0).toLocaleString("en-EG")}</strong></div>
          </div>
          <div className="erp-home-backlog__distribution-title"><strong>Age of currently open orders</strong><span>{known} dated</span></div>
          {known ? (
            <div className="erp-home-backlog__bar" role="img" aria-label={bands.map((band) => `${band.label}: ${band.count}`).join(", ")}>
              {bands.filter((band) => band.count > 0).map((band) => <span key={band.key} style={{ width: `${band.count / known * 100}%`, background: band.color }} title={`${band.label}: ${band.count}`} />)}
            </div>
          ) : <div className="erp-home-backlog__bar erp-home-backlog__bar--empty" aria-label="No dated open orders" />}
          <div className="erp-home-backlog__legend">
            {bands.map((band) => <div key={band.key}><i style={{ background: band.color }} /><span>{band.label}</span><strong>{band.count}</strong></div>)}
          </div>
          {Number(data.unknownDate || 0) > 0 ? <p className="erp-home-backlog__warning">{data.unknownDate} open order(s) have no valid creation date. They are included in the open count, but excluded from age statistics.</p> : null}
          <p className="erp-home-backlog__hint">Ages are measured from creation, not from the last status change. This is not completion time or a configured SLA.{selectedDuration !== "all" ? " Only orders created within the selected period are included." : ""}</p>
        </div>
        <aside className="erp-home-backlog__oldest">
          <div className="erp-home-backlog__oldest-head"><div><strong>Oldest open orders</strong><span>Prioritize follow-up</span></div><Icon name="alert" /></div>
          {oldest.length ? <div className="erp-home-backlog__oldest-list">
            {oldest.map((item, index) => <div className="erp-home-backlog__oldest-row" key={`${item.key}-${index}`}>
              <span className="erp-home-backlog__oldest-rank">{index + 1}</span>
              <div><strong>{item.label}</strong><span>Created {new Date(item.createdTime).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span></div>
              <b>{item.ageDays}d</b>
            </div>)}
          </div> : <p className="erp-home-backlog__none">No dated open orders for this workspace and period.</p>}
          <Link className="erp-home-backlog__open" href={toRouterPath(selected.definition.href)}>Open {selected.definition.title} <Icon name="arrow" /></Link>
        </aside>
      </div>
    </section>
  );
}

function processingTimeText(hours) {
  if (hours === null || !Number.isFinite(Number(hours))) return "—";
  const value = Number(hours);
  if (value < 1) return value > 0 && value * 60 < 1 ? "<1 min" : `${Math.round(value * 60)} min`;
  if (value < 48) return `${value.toLocaleString("en-EG", { maximumFractionDigits: 1 })} hrs`;
  return `${(value / 24).toLocaleString("en-EG", { maximumFractionDigits: 1 })} days`;
}

function ProcessingTimeInsights({ workspaces, lifecycleAnalysis = {} }) {
  const [active, setActive] = useState("current");
  const available = workspaces.filter(({ definition }) => Boolean(lifecycleAnalysis?.workspaces?.[definition.key]));
  if (!workspaces.length) return null;
  const selected = available.find(({ definition }) => definition.key === active) || available[0];
  const state = lifecycleAnalysis?.state || "unavailable";
  const data = selected ? lifecycleAnalysis.workspaces[selected.definition.key] : null;

  return (
    <section className="erp-home-cycle" aria-label="Audited order processing times">
      <div className="erp-home-cycle__head">
        <div>
          <span className="erp-home-dashboard__eyebrow"><Icon name="clock" /> WORKFLOW PERFORMANCE</span>
          <h2>Processing time</h2>
          <p>Measured from recorded workflow events, not estimated from current statuses.</p>
        </div>
        {state === "ready" ? <div className="erp-home-cycle__tabs" role="group" aria-label="Processing time workspace">
          {available.map(({ definition }) => <button key={definition.key} type="button"
            className={selected?.definition.key === definition.key ? "is-active" : ""}
            aria-pressed={selected?.definition.key === definition.key}
            onClick={() => setActive(definition.key)}>{definition.shortTitle}</button>)}
        </div> : null}
      </div>
      {state !== "ready" ? (
        <div className="erp-home-cycle__notice" role="status">
          <Icon name="alert" />
          <div><strong>{state === "needs-setup" ? "Lifecycle tracking needs activation" : state === "too-many-orders" ? "Narrow the Analysis filter" : "Processing time data unavailable"}</strong>
            <p>{state === "needs-setup" ? "Run supabase_order_lifecycle_audit.sql once in Supabase. New order changes will then be recorded automatically."
              : state === "too-many-orders" || state === "too-many-events" ? "This selection is too large for the safe analytics limit. Choose a shorter period or a specific user."
              : "Order activity remains available. Processing times will appear when the audit table can be read."}</p>
          </div>
        </div>
      ) : data ? (
        <>
          <div className="erp-home-cycle__scope"><strong>{data.label}</strong><span>{data.sample} completed timeline{data.sample === 1 ? "" : "s"} verified</span></div>
          <div className="erp-home-cycle__metrics">
            <div><span>Median processing time</span><strong>{processingTimeText(data.medianHours)}</strong><small>Middle value of completed timelines</small></div>
            <div><span>Average processing time</span><strong>{processingTimeText(data.averageHours)}</strong><small>From the same verified sample</small></div>
            <div><span>Fastest</span><strong>{processingTimeText(data.minHours)}</strong><small>Recorded completion</small></div>
            <div><span>Longest</span><strong>{processingTimeText(data.maxHours)}</strong><small>Recorded completion</small></div>
          </div>
          <p className="erp-home-cycle__hint">{data.audited} of {data.eligible} selected orders have a complete recorded creation history. {data.excluded} lack full history; older orders are intentionally excluded. {data.sample === 0 ? "No verified completed timeline is available yet. " : ""}Times are elapsed calendar hours, not business hours. No SLA target has been configured.</p>
        </>
      ) : <p className="erp-home-cycle__hint">No accessible order workspaces in this selection.</p>}
    </section>
  );
}

function SlaMonitoring({ workspaces, lifecycleAnalysis = {} }) {
  const [active, setActive] = useState("current");
  if (!workspaces.length) return null;
  const sla = lifecycleAnalysis?.sla;
  const auditReady = lifecycleAnalysis?.state === "ready";
  const slaReady = auditReady && sla?.state === "ready";
  const selected = workspaces.find(({ definition }) => definition.key === active) || workspaces[0];
  const data = slaReady ? sla?.workspaces?.[selected.definition.key] : null;
  const configured = Boolean(data?.configured);
  const statuses = configured ? [
    { key: "activeOnTrack", label: "On track", tone: "good", detail: "Open · below warning level" },
    { key: "activeWarning", label: "Approaching target", tone: "warn", detail: `Open · ${data.warningPercent}% of target used` },
    { key: "activeOverdue", label: "Over target", tone: "bad", detail: "Open · target exceeded" },
    { key: "completedOnTime", label: "Completed on time", tone: "good", detail: "Verified completed orders" },
    { key: "completedLate", label: "Completed late", tone: "bad", detail: "Verified completed orders" },
  ] : [];
  const tracked = configured ? data.audited : 0;
  return (
    <section className="erp-home-sla" aria-label="Optional SLA monitoring">
      <div className="erp-home-sla__head">
        <div>
          <span className="erp-home-dashboard__eyebrow"><Icon name="alert" /> SERVICE TARGETS</span>
          <h2>SLA monitoring</h2>
          <p>Optional deadlines measured from verified order events, for each workflow independently.</p>
        </div>
        <div className="erp-home-sla__tabs" role="group" aria-label="SLA workspace">
          {workspaces.map(({ definition }) => <button key={definition.key} type="button"
            className={selected.definition.key === definition.key ? "is-active" : ""}
            aria-pressed={selected.definition.key === definition.key}
            onClick={() => setActive(definition.key)}>{definition.shortTitle}</button>)}
        </div>
      </div>
      {!auditReady ? (
        <div className="erp-home-sla__notice" role="status"><Icon name="alert" /><div><strong>Lifecycle data not available</strong><p>Activate or restore the lifecycle audit first. SLA deadlines will never be inferred from order creation dates alone.</p></div></div>
      ) : !slaReady ? (
        <div className="erp-home-sla__notice" role="status"><Icon name="alert" /><div><strong>{sla?.state === "needs-setup" ? "SLA configuration needs setup" : "SLA settings unavailable"}</strong><p>{sla?.state === "needs-setup" ? "Run supabase_home_sla_policies.sql in Supabase SQL Editor. All targets start disabled." : "Check the server-side Supabase service-role permission for the SLA policies table."}</p></div></div>
      ) : !configured ? (
        <div className="erp-home-sla__notice" role="status"><Icon name="clock" /><div><strong>No active target for {selected.definition.title}</strong><p>Choose and enable a target in Supabase (erp_home_sla_policies). No deadlines, overdue labels, or alerts are assumed until a policy is approved.</p></div></div>
      ) : (
        <>
          <div className="erp-home-sla__policy">
            <div><span>Configured target</span><strong>{processingTimeText(data.targetHours)}</strong><small>{data.label}</small></div>
            <div><span>Advance warning</span><strong>{data.warningPercent}%</strong><small>Of allowed elapsed time</small></div>
            <div><span>Closed within target</span><strong>{data.onTimePercent === null ? "—" : `${data.onTimePercent}%`}</strong><small>{data.completionSample} verified completion{data.completionSample === 1 ? "" : "s"}</small></div>
          </div>
          <div className="erp-home-sla__statuses">
            {statuses.map((status) => <div className={`erp-home-sla__status erp-home-sla__status--${status.tone}`} key={status.key}>
              <span>{status.label}</span><strong>{Number(data[status.key] || 0).toLocaleString("en-EG")}</strong><small>{status.detail}</small>
            </div>)}
          </div>
          <div className="erp-home-sla__coverage">
            <span><strong>{tracked}</strong> of {data.eligible} selected orders have complete audit histories</span>
            {Number(data.awaitingStart || 0) > 0 ? <span>{data.awaitingStart} awaiting this workflow stage</span> : null}
          </div>
          {data.topOverdue?.length ? <div className="erp-home-sla__overdue">
            <div className="erp-home-sla__overdue-title"><strong>Longest-running overdue orders</strong><Link href={toRouterPath(selected.definition.href)}>Open workspace <Icon name="arrow" /></Link></div>
            <div className="erp-home-sla__overdue-list">{data.topOverdue.map((order) => <div key={order.orderNumber}>
              <strong>Order #{order.orderNumber}</strong><span>{processingTimeText(order.elapsedHours)} elapsed</span>
            </div>)}</div>
          </div> : null}
        </>
      )}
      <p className="erp-home-sla__footnote">SLA targets use continuous calendar hours (including weekends). This is a read-only dashboard: no automatic email, push notification, escalation, or enforced approval is enabled. Older orders without complete audit histories are excluded.</p>
    </section>
  );
}

function ComparisonMetric({ title, value, previous, delta, format = "number" }) {
  const showMoney = format === "money";
  const label = showMoney ? compactMoney(value) : Number(value || 0).toLocaleString("en-EG");
  const previousLabel = showMoney ? compactMoney(previous) : Number(previous || 0).toLocaleString("en-EG");
  let trendLabel = "No change";
  if (delta !== null && Number.isFinite(delta)) trendLabel = `${delta > 0 ? "+" : ""}${delta}%`;
  else if (Number(value) > 0 && Number(previous) === 0) trendLabel = "New activity";
  return (
    <div className="erp-home-trend-metric">
      <span className="erp-home-trend-metric__label">{title}</span>
      <strong title={showMoney ? money(value) : undefined}>{label}</strong>
      <div className="erp-home-trend-metric__bottom">
        <span className={`erp-home-trend-metric__change${delta > 0 ? " is-up" : delta < 0 ? " is-down" : ""}`}>{trendLabel}</span>
        <span title={showMoney ? money(previous) : undefined}>Prior: {previousLabel}</span>
      </div>
    </div>
  );
}

function TrendInsights({ workspaces, trendAnalysis = {} }) {
  const [active, setActive] = useState("current");
  const [selectedBin, setSelectedBin] = useState(null);
  const available = workspaces.filter(({ definition }) => Boolean(trendAnalysis?.[definition.key]));
  const selected = available.find(({ definition }) => definition.key === active) || available[0];
  if (!selected) return null;

  const data = trendAnalysis[selected.definition.key];
  const bins = Array.isArray(data.bins) ? data.bins : [];
  const max = Number(data.max || 0);
  const legend = Array.isArray(data.statusDefinitions) ? data.statusDefinitions : [];
  const activeBin = bins.find((bin) => `${selected.definition.key}:${bin.key}` === selectedBin);

  return (
    <section className="erp-home-trends" aria-label="Orders trends and period comparison">
      <div className="erp-home-trends__top">
        <div className="erp-home-trends__heading">
          <span className="erp-home-dashboard__eyebrow"><Icon name="chart" /> TIME-BASED INSIGHTS</span>
          <h2>Orders activity</h2>
          <p>Creation dates grouped by the orders' current status. Tap a bar for details.</p>
        </div>
        <div className="erp-home-trends__tabs" role="tablist" aria-label="Choose order workspace">
          {available.map(({ definition }) => (
            <button key={definition.key} type="button" role="tab" aria-selected={selected.definition.key === definition.key}
              className={selected.definition.key === definition.key ? "is-active" : ""}
              onClick={() => setActive(definition.key)}>{definition.shortTitle}</button>
          ))}
        </div>
      </div>
      <div className="erp-home-trends__body">
        <div className="erp-home-trends__visual" role="tabpanel" aria-label={`${selected.definition.title} orders activity`}>
          <div className="erp-home-trends__chart-title">
            <div><strong>{data.trendLabel}</strong><span>{data.compareLabel}</span></div>
            <span className="erp-home-trends__bar-total">{Number(data.current?.count || 0).toLocaleString("en-EG")} orders</span>
          </div>
          {max > 0 ? (
            <div className="erp-home-trends__chart" role="group" aria-label={`${selected.definition.title}: ${bins.map((bin) => `${bin.label}: ${bin.count}`).join(", ")}`}>
              {bins.map((bin) => (
                <button type="button" className={`erp-home-trends__column${activeBin?.key === bin.key ? " is-selected" : ""}`} key={bin.key}
                  title={`${bin.label}: ${bin.count} orders`} aria-pressed={activeBin?.key === bin.key} aria-label={`${bin.label}: ${bin.count} orders. Show status breakdown.`}
                  onClick={() => setSelectedBin((prior) => prior === `${selected.definition.key}:${bin.key}` ? null : `${selected.definition.key}:${bin.key}`)}>
                  <span className="erp-home-trends__count">{bin.count || ""}</span>
                  <div className="erp-home-trends__track">
                    <div className="erp-home-trends__stack" style={{ height: `${bin.count ? (bin.count / max * 100) : 0}%` }}>
                      {bin.parts.filter((part) => part.count > 0).map((part) => (
                        <span key={part.key} style={{ backgroundColor: part.color, flex: part.count }} title={`${part.label}: ${part.count}`} />
                      ))}
                    </div>
                  </div>
                  <span className="erp-home-trends__date" title={bin.label}>{bin.shortLabel || bin.label}</span>
                </button>
              ))}
            </div>
          ) : <div className="erp-home-trends__empty"><Icon name="chart" /><strong>No dated orders in this period</strong><span>Activity will appear here when dated orders are available.</span></div>}
          <div className="erp-home-trends__legend">
            {legend.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}
          </div>
          {activeBin ? <div className="erp-home-trends__drilldown" aria-live="polite">
            <div className="erp-home-trends__drilldown-head"><strong>{activeBin.label} · {activeBin.count} orders</strong><button type="button" aria-label="Close chart details" onClick={() => setSelectedBin(null)}>×</button></div>
            <div className="erp-home-trends__drilldown-values">
              {activeBin.parts.map((part) => <span key={part.key}><i style={{ background: part.color }} />{part.label}<b>{part.count}</b></span>)}
            </div>
          </div> : null}
          {Number(data.undated || 0) > 0 ? <p className="erp-home-trends__note">{data.undated} order(s) have no usable creation date and are excluded from date comparisons.</p> : null}
        </div>
        <aside className="erp-home-trends__comparison" aria-label="Previous period comparison">
          <span className="erp-home-trends__comparison-label">PERIOD COMPARISON</span>
          <ComparisonMetric title="Orders created" value={data.current?.count || 0} previous={data.previous?.count || 0} delta={data.countDelta} />
          <ComparisonMetric title="Value of created orders" value={data.current?.cost || 0} previous={data.previous?.cost || 0} delta={data.costDelta} format="money" />
          <p>Changes compare creation dates, not completion dates. An increase is not necessarily a performance improvement.</p>
        </aside>
      </div>
    </section>
  );
}

function GlobalSelect({ value, options, open, onToggle, onChoose }) {
  const selected = options.find((option) => String(option.value) === String(value)) || options[0];
  return (
    <div className="home-global-select">
      <button
        className="home-global-select__trigger"
        type="button"
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
        }}
      >
        <span>{selected?.label || "All"}</span>
        <Icon name="chevron-down" />
      </button>
      <div className="home-global-select__options" hidden={!open}>
        {options.map((option) => (
          <button
            type="button"
            className={`home-global-select__option${String(option.value) === String(value) ? " is-selected" : ""}`}
            key={option.value}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onChoose(option.value);
            }}
          >
            <span>{option.label}</span>
            <Icon name="check" />
          </button>
        ))}
      </div>
    </div>
  );
}

function GlobalAnalysisControl({ users = [], usersReady = false, selectedUser = "all", selectedDuration = "all" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [openSelect, setOpenSelect] = useState("");
  const [availableUsers, setAvailableUsers] = useState(users);
  const [usersLoaded, setUsersLoaded] = useState(usersReady);
  const [usersLoading, setUsersLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const close = () => {
    setOpen(false);
    setOpenSelect("");
  };
  useOutsideClose(ref, close);

  useEffect(() => {
    if (users.length) {
      setAvailableUsers(users);
      if (usersReady) {
        setUsersLoaded(true);
        try {
          window.sessionStorage.setItem("erp-home-analysis-users-v1", JSON.stringify(users));
        } catch {}
        return;
      }
    }

    try {
      const cached = JSON.parse(window.sessionStorage.getItem("erp-home-analysis-users-v1") || "[]");
      if (Array.isArray(cached) && cached.length) {
        setAvailableUsers(cached);
        setUsersLoaded(true);
      }
    } catch {}
  }, [users, usersReady]);

  const loadUsers = async () => {
    if (usersLoaded || usersLoading) return;
    setUsersLoading(true);
    try {
      const response = await fetch("/next/api/home/analysis-users", { credentials: "same-origin", cache: "no-store" });
      const payload = response.ok ? await response.json().catch(() => ({})) : {};
      const loadedUsers = Array.isArray(payload?.users) ? payload.users : [];
      setAvailableUsers(loadedUsers);
      try {
        window.sessionStorage.setItem("erp-home-analysis-users-v1", JSON.stringify(loadedUsers));
      } catch {}
    } catch {
      setAvailableUsers([]);
    } finally {
      setUsersLoading(false);
      setUsersLoaded(true);
    }
  };

  const userOptions = useMemo(() => [
    { value: "all", label: usersLoading ? "Loading users…" : "All users" },
    ...availableUsers.map((user) => ({ value: String(user.id), label: user.name || user.username || String(user.id) })),
  ], [availableUsers, usersLoading]);
  const durationOptions = [
    { value: "all", label: "All time" },
    { value: "week", label: "Last week" },
    { value: "month", label: "Last month" },
    { value: "year", label: "Last year" },
  ];

  const applyQuery = (name, value) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(name);
    else params.set(name, String(value));
    const query = params.toString();
    close();
    const targetPath = toRouterPath(pathname);
    startTransition(() => router.replace(query ? `${targetPath}?${query}` : targetPath, { scroll: false }));
  };

  return (
    <div className="home-global-analysis" ref={ref}>
      <button
        className="home-global-analysis__trigger"
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-busy={isPending}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => {
            const next = !value;
            if (next) void loadUsers();
            return next;
          });
          setOpenSelect("");
        }}
      >
        <span className="home-global-analysis__icon"><Icon name="activity" /></span>
        <strong>Analysis</strong>
        <Icon name="chevron-down" />
      </button>
      <div className="home-global-analysis__menu next-home-global-analysis__menu" hidden={!open}>
        <div className="home-global-analysis__field">
          <span>Users</span>
          <GlobalSelect
            value={selectedUser}
            options={userOptions}
            open={openSelect === "user"}
            onToggle={() => setOpenSelect((value) => value === "user" ? "" : "user")}
            onChoose={(value) => applyQuery("analysisUser", value)}
          />
        </div>
        <div className="home-global-analysis__field">
          <span>Duration</span>
          <GlobalSelect
            value={selectedDuration}
            options={durationOptions}
            open={openSelect === "duration"}
            onToggle={() => setOpenSelect((value) => value === "duration" ? "" : "duration")}
            onChoose={(value) => applyQuery("analysisDuration", value)}
          />
        </div>
      </div>
    </div>
  );
}

function StockCard({ tagSummaries = {}, tags = [] }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [tag, setTag] = useState("all");
  const close = () => {
    setOpen(false);
    setOptionsOpen(false);
  };
  useOutsideClose(ref, close);

  useEffect(() => {
    if (tag !== "all" && !tags.includes(tag)) setTag("all");
  }, [tag, tags]);

  const summary = tagSummaries[tag] || tagSummaries.all || { quantity: 0, cost: 0, records: 0 };
  const tagOptions = [{ value: "all", label: "All tags" }, ...tags.map((value) => ({ value, label: value }))];

  return (
    <div className="stat home-kpi home-stock-card">
      <div className="home-stock-card__head">
        <a className="home-stock-card__title" href="/next/stocktaking">Stocktaking</a>
        <div className="home-stock-analysis" ref={ref}>
          <button
            className="home-stock-analysis__trigger"
            type="button"
            aria-expanded={open}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen((value) => !value);
              setOptionsOpen(false);
            }}
          >
            <Icon name="activity"/><span>Analysis</span><Icon name="chevron-down"/>
          </button>
          <div className="home-stock-analysis__menu next-home-stock-analysis__menu" hidden={!open}>
            <div className="home-stock-filter">
              <span className="home-stock-filter__label">Filter by tag</span>
              <button
                className="home-stock-filter__trigger"
                type="button"
                aria-expanded={optionsOpen}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setOptionsOpen((value) => !value);
                }}
              >
                <span>{tag === "all" ? "All tags" : tag}</span>
                <Icon name="chevron-down" />
              </button>
              <div className="home-stock-filter__options" hidden={!optionsOpen}>
                {tagOptions.map((option) => (
                  <button
                    className={`home-stock-filter__option${option.value === tag ? " is-selected" : ""}`}
                    key={option.value}
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setTag(option.value);
                      setOptionsOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    <Icon name="check" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="home-stock-card__metrics">
        <div><span>Total components</span><strong>{summary.quantity}</strong></div>
        <div><span>Total components cost</span><strong>{money(summary.cost)}</strong></div>
      </div>
      <div className="home-kpi-sub">
        {summary.records} component records{tag !== "all" ? ` • ${tag}` : ""}
      </div>
    </div>
  );
}

export default function HomeOverviewClient({
  analysisUsers = [],
  analysisUsersReady = false,
  selectedUser = "all",
  selectedDuration = "all",
  currentMatrix,
  reviewMatrix,
  operationsMatrix,
  maintenanceSummary,
  trendAnalysis = {},
  backlogAnalysis = {},
  lifecycleAnalysis = {},
  stockTagSummaries,
  stockTags,
  expenseSummary,
  showCurrent,
  showReview,
  showOperations,
  showMaintenance,
  showStock,
  showExpenses,
}) {
  const available = [
    showCurrent ? { definition: DASHBOARD_WORKSPACES[0], matrix: currentMatrix } : null,
    showReview ? { definition: DASHBOARD_WORKSPACES[1], matrix: reviewMatrix } : null,
    showOperations ? { definition: DASHBOARD_WORKSPACES[2], matrix: operationsMatrix } : null,
    showMaintenance ? { definition: DASHBOARD_WORKSPACES[3], matrix: { status: { all: maintenanceSummary }, type: { all: maintenanceSummary } }, statusOnly: true } : null,
  ].filter(Boolean);

  return (
    <section aria-label="Operations dashboard" className="erp-home-dashboard">
      <div className="erp-home-dashboard__header">
        <div className="erp-home-dashboard__heading">
          <span className="erp-home-dashboard__eyebrow"><Icon name="activity"/> OPERATIONS DASHBOARD</span>
          <h2>Workspace overview</h2>
          <p>Order counts, values and progress in one place.</p>
        </div>
        <GlobalAnalysisControl users={analysisUsers} usersReady={analysisUsersReady} selectedUser={selectedUser} selectedDuration={selectedDuration} />
      </div>

      {available.length ? (
        <>
          <div className="erp-home-tiles" aria-label="Order workspace totals">
            {available.map(({ definition, matrix }) => <SummaryTile key={definition.key} definition={definition} summary={safeStatus(matrix)} />)}
          </div>
          <FocusQueue workspaces={available} trendAnalysis={trendAnalysis} />
          <BacklogHealth workspaces={available} backlogAnalysis={backlogAnalysis} selectedDuration={selectedDuration} />
          <ProcessingTimeInsights workspaces={available} lifecycleAnalysis={lifecycleAnalysis} />
          <SlaMonitoring workspaces={available} lifecycleAnalysis={lifecycleAnalysis} />
          <TrendInsights workspaces={available} trendAnalysis={trendAnalysis} />
          <div className="erp-home-dashboard__section-heading">
            <div><span>DETAILED ANALYSIS</span><h2>Order breakdown</h2></div>
            <p>Each workspace is calculated separately</p>
          </div>
          <div className="erp-home-order-grid">
            {available.map(({ definition, matrix, statusOnly }) => (
              <OrderOverviewCard key={definition.key} definition={definition} matrix={statusOnly ? { status: matrix.status } : matrix} statusOnly={statusOnly} />
            ))}
          </div>
        </>
      ) : null}

      {showStock || showExpenses ? (
        <section className="erp-home-secondary" aria-label="Additional analytics">
          <div className="erp-home-dashboard__section-heading"><div><span>MORE INSIGHTS</span><h2>Inventory & expenses</h2></div></div>
          <div className="erp-home-secondary__grid">
            {showStock ? <StockCard tagSummaries={stockTagSummaries} tags={stockTags} /> : null}
            {showExpenses && expenseSummary ? <ExpensesCard summary={expenseSummary} /> : null}
          </div>
        </section>
      ) : null}
    </section>
  );
}
