"use client";

import { useEffect, useMemo, useState } from "react";
import { MODULES, PAGE_FLOW } from "./how-it-works-data";

const ROUTE_MAP = {
  home: "/next/home",
  "current-orders": "/next/orders",
  "orders-review": "/next/orders-review",
  "operations-orders": "/next/operations-orders",
  "maintenance-orders": "/next/maintenance-orders",
  "create-order": "/next/orders/new",
  stocktaking: "/next/stocktaking",
  b2b: "/next/lms/schools",
  tasks: "/next/task-management",
  expenses: "/next/expenses",
  "expenses-users": "/next/expenses/users",
  account: "/next/account",
};

const TOKEN_ROUTE_MAP = new Map([
  ["home", "/next/home"],
  ["current orders", "/next/orders"],
  ["/orders", "/next/orders"],
  ["orders review", "/next/orders-review"],
  ["/orders/sv-orders", "/next/orders-review"],
  ["requested orders", "/next/operations-orders"],
  ["operations orders", "/next/operations-orders"],
  ["/orders/requested", "/next/operations-orders"],
  ["maintenance orders", "/next/maintenance-orders"],
  ["/orders/maintenance-orders", "/next/maintenance-orders"],
  ["create new order", "/next/orders/new"],
  ["shopping cart", "/next/orders/new"],
  ["/orders/new", "/next/orders/new"],
  ["/orders/new/products", "/next/orders/new"],
  ["stocktaking", "/next/stocktaking"],
  ["/stocktaking", "/next/stocktaking"],
  ["products", "/next/products"],
  ["/products", "/next/products"],
  ["proposals", "/next/proposals"],
  ["/proposals", "/next/proposals"],
  ["kits", "/next/kits"],
  ["/kits", "/next/kits"],
  ["events", "/next/events"],
  ["event requests", "/next/events"],
  ["/events", "/next/events"],
  ["new event request", "/next/events/new"],
  ["/events/new", "/next/events/new"],
  ["event calendar", "/next/events-calendar"],
  ["/events/calendar", "/next/events-calendar"],
  ["event components", "/next/event-components"],
  ["/events/components", "/next/event-components"],
  ["task management", "/next/task-management"],
  ["all tasks", "/next/task-management/all-tasks"],
  ["my tasks", "/next/task-management/my-tasks"],
  ["delegated tasks", "/next/task-management/delegated-tasks"],
  ["/task-management", "/next/task-management"],
  ["expenses", "/next/expenses"],
  ["/expenses", "/next/expenses"],
  ["expenses users", "/next/expenses/users"],
  ["/expenses/users", "/next/expenses/users"],
  ["kpis", "/next/kpis"],
  ["/kpis", "/next/kpis"],
  ["users center", "/next/users-center"],
  ["user access & data", "/next/users-center"],
  ["/user-access", "/next/users-center"],
  ["system history", "/next/history"],
  ["history", "/next/history"],
  ["/history", "/next/history"],
  ["database backup", "/next/backup"],
  ["backup", "/next/backup"],
  ["/backup", "/next/backup"],
  ["notifications", "/next/notifications"],
  ["/notifications", "/next/notifications"],
  ["customer database", "/next/b2c/database"],
  ["b2c customer database", "/next/b2c/database"],
  ["/b2c/database", "/next/b2c/database"],
  ["customer form", "/next/b2c/forms"],
  ["b2c customer form", "/next/b2c/forms"],
  ["/b2c/form", "/next/b2c/forms"],
  ["b2b", "/next/lms/schools"],
  ["/b2b", "/next/lms/schools"],
  ["lms", "/next/lms"],
  ["lms-users-center", "/next/lms/users-center"],
  ["lms-b2b", "/next/lms/schools"],
  ["lms-curriculum", "/next/lms/curriculum"],
  ["lms users center", "/next/lms/users-center"],
  ["lms schools", "/next/lms/schools"],
  ["lms curriculum", "/next/lms/curriculum"],
  ["account", "/next/account"],
  ["/account", "/next/account"],
]);

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePath(value) {
  return normalize(value).replace(/\/+$/, "");
}

function titleFromToken(raw) {
  const value = String(raw || "").trim();
  if (!value) return "Extra module";
  const friendly = { "lms-users-center": "LMS Users Center", "lms-b2b": "LMS Schools", "lms-curriculum": "LMS Curriculum" }[normalize(value)];
  if (friendly) return friendly;
  if (value.startsWith("/")) {
    const slug = value.replace(/^\/+/, "").replace(/\/+|[-_]+/g, " ").trim();
    return slug ? slug.replace(/\b\w/g, (char) => char.toUpperCase()) : "Extra module";
  }
  return value;
}

function buildAllowedSet(allowedPages) {
  const set = new Set();
  for (const value of Array.isArray(allowedPages) ? allowedPages : []) {
    const key = normalize(value);
    const path = normalizePath(value);
    if (key) set.add(key);
    if (path) {
      set.add(path);
      set.add(path.startsWith("/") ? path.slice(1) : `/${path}`);
    }
  }
  return set;
}

function moduleVisible(module, allowedSet) {
  if (module?.alwaysVisible) return true;
  return (Array.isArray(module?.access) ? module.access : []).some((alias) => {
    const key = normalize(alias);
    const path = normalizePath(alias);
    return allowedSet.has(key) || allowedSet.has(path) || (path && allowedSet.has(`/${path}`));
  });
}

function collectMappedTokens(module) {
  return new Set((Array.isArray(module?.access) ? module.access : []).map(normalizePath).filter(Boolean));
}

function fallbackRoute(raw) {
  const token = normalizePath(raw);
  return TOKEN_ROUTE_MAP.get(token) || TOKEN_ROUTE_MAP.get(normalize(raw)) || "";
}

function createFallbackModule(rawLabel) {
  const title = titleFromToken(rawLabel);
  const clean = normalizePath(rawLabel) || normalize(title) || "extra-module";
  const safeId = `extra-${clean.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
  const route = fallbackRoute(rawLabel);
  return {
    id: safeId || "extra-module",
    type: "page",
    icon: "layers",
    title,
    route: route || String(rawLabel || "Assigned to your account"),
    eyebrow: "Additional access",
    overview: "This module is enabled for your account. A detailed page-specific SOP has not been authored in the classic guide yet, so use the live page together with the shared operating rules.",
    purpose: "Keep users inside the correct access boundary while still exposing every page assigned to the account.",
    whenToUse: "Use this page only when your role requires it and review the page actions before changing data.",
    result: "The user stays aware of the complete permission scope even before a detailed SOP is added.",
    flows: [{
      title: "Use the page carefully",
      summary: "Follow the live interface while keeping to the shared operating rules until a page-specific SOP is authored.",
      outcome: "Safe use inside your permission scope",
      steps: [
        { label: "Open it from allowed navigation", note: "Stay inside the page already assigned to your account." },
        { label: "Read visible tabs and actions first", note: "Understand the page owner step before changing data." },
        { label: "Escalate if the workflow is unclear", note: "Ask the operations lead before making uncertain updates." },
      ],
    }],
    steps: [
      { title: "Open the page from your allowed navigation", body: "Enter the page through the sidebar or the route already enabled for your account." },
      { title: "Read the visible actions first", body: "Review the page header, tabs, and action buttons before making changes." },
      { title: "Apply the shared operating rules", body: "Use proof where required, avoid duplicate data entry, and refresh when data looks stale." },
    ],
    rules: [
      "Only use the actions that belong to your role and current permission scope.",
      "Escalate before changing a workflow you are not fully sure about.",
    ],
    controls: ["Permission-based access"],
    keywords: ["extra module", "permission", title],
  };
}

function moduleOrderIndex(id) {
  const index = PAGE_FLOW.indexOf(id);
  return index === -1 ? PAGE_FLOW.length + 100 : index;
}

function visibleModulesFor(account) {
  const allowedPages = [...(Array.isArray(account?.allowedPages) ? account.allowedPages : [])];
  const lmsPages = Array.isArray(account?.lmsAccess?.pages) ? account.lmsAccess.pages : [];
  for (const page of lmsPages) {
    if (page?.isEnabled === false) continue;
    const key = String(page?.pageKey || page?.page_key || "").trim();
    if (key) allowedPages.push(key);
  }
  const allowedSet = buildAllowedSet(allowedPages);
  const detailed = MODULES.filter((module) => moduleVisible(module, allowedSet));
  const mapped = new Set();
  detailed.forEach((module) => collectMappedTokens(module).forEach((token) => mapped.add(token)));

  const fallback = [];
  for (const label of allowedPages) {
    const token = normalizePath(label);
    if (!token || mapped.has(token)) continue;
    const display = titleFromToken(label);
    if (!display || ["home", "account", "how it works"].includes(normalize(display))) continue;
    fallback.push(createFallbackModule(label));
    mapped.add(token);
  }

  return [...detailed, ...fallback].sort((a, b) => {
    const sharedA = a.type === "shared" ? -1 : 0;
    const sharedB = b.type === "shared" ? -1 : 0;
    if (sharedA !== sharedB) return sharedA - sharedB;
    const order = moduleOrderIndex(a.id) - moduleOrderIndex(b.id);
    return order || String(a.title || "").localeCompare(String(b.title || ""));
  });
}

function searchText(module) {
  return [
    module?.title, module?.route, module?.eyebrow, module?.overview, module?.purpose, module?.whenToUse, module?.result,
    ...(module?.controls || []), ...(module?.rules || []), ...(module?.keywords || []),
    ...((module?.flows || []).flatMap((flow) => [flow?.title, flow?.summary, flow?.outcome, ...((flow?.steps || []).flatMap((step) => [typeof step === "string" ? step : step?.label, typeof step === "string" ? "" : step?.note]))])),
    ...((module?.steps || []).flatMap((step) => [step?.title, step?.body])),
  ].filter(Boolean).join(" ").toLowerCase();
}

function routeFor(module) {
  return ROUTE_MAP[module?.id] || fallbackRoute(module?.route) || (String(module?.route || "").startsWith("/") ? module.route : "");
}

function GuideIcon({ name = "book", size = 18 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
  const paths = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    external: <><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></>,
    workflow: <><rect x="3" y="3" width="6" height="6" rx="2"/><rect x="15" y="15" width="6" height="6" rx="2"/><path d="M9 6h4a4 4 0 0 1 4 4v5"/><path d="m14 12 3 3 3-3"/></>,
    list: <><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    minus: <path d="M5 12h14"/>,
  };
  return <svg {...common}>{paths[name] || paths.book}</svg>;
}

function moduleIconName(module) {
  if (module?.type === "shared") return "shield";
  const key = normalize(`${module?.id || ""} ${module?.title || ""}`);
  if (key.includes("home")) return "home";
  if (key.includes("account") || key.includes("user")) return "user";
  if (key.includes("order") || key.includes("task") || key.includes("event")) return "workflow";
  return "layers";
}

function FlowCard({ flow, index }) {
  const steps = Array.isArray(flow?.steps) ? flow.steps : [];
  return (
    <article className="next-sop-flow-card">
      <header>
        <div className="next-sop-flow-heading">
          <span className="next-sop-flow-number">{index + 1}</span>
          <div><small>Process flow</small><h4>{flow?.title || `Process ${index + 1}`}</h4></div>
        </div>
        {flow?.outcome ? <em>{flow.outcome}</em> : null}
      </header>
      {flow?.summary ? <p>{flow.summary}</p> : null}
      <div className="next-sop-flow-track">
        {steps.map((step, stepIndex) => {
          const label = typeof step === "string" ? step : (step?.label || step?.title || `Step ${stepIndex + 1}`);
          const note = typeof step === "string" ? "" : (step?.note || step?.body || "");
          return (
            <div className="next-sop-flow-step" key={`${label}-${stepIndex}`}>
              <b>{stepIndex + 1}</b>
              <strong>{label}</strong>
              {note ? <small>{note}</small> : null}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function ModuleCard({ module, expanded, onToggle }) {
  const destination = routeFor(module);
  const flowTotal = Array.isArray(module?.flows) ? module.flows.length : 0;
  const stepTotal = Array.isArray(module?.steps) ? module.steps.length : 0;
  const ruleTotal = Array.isArray(module?.rules) ? module.rules.length : 0;

  return (
    <section className={`next-sop-module${expanded ? " is-expanded" : ""}`} id={module.id}>
      <div className="next-sop-module-head">
        <button
          type="button"
          className="next-sop-module-toggle"
          aria-expanded={expanded}
          aria-controls={`${module.id}-details`}
          onClick={onToggle}
        >
          <span className="next-sop-module-icon"><GuideIcon name={moduleIconName(module)} size={19} /></span>
          <span className="next-sop-module-copy">
            <small>{module?.eyebrow || "Guide"}</small>
            <strong>{module?.title || "Guide section"}</strong>
            <span>{module?.overview || ""}</span>
          </span>
          <span className="next-sop-module-counters" aria-hidden="true">
            {flowTotal ? <span><GuideIcon name="workflow" size={13} />{flowTotal}</span> : null}
            {stepTotal ? <span><GuideIcon name="list" size={13} />{stepTotal}</span> : null}
            {ruleTotal ? <span><GuideIcon name="shield" size={13} />{ruleTotal}</span> : null}
          </span>
          <span className="next-sop-module-chevron"><GuideIcon name="chevron" size={18} /></span>
        </button>
        {destination ? (
          <a className="next-sop-open-module" href={destination} title={`Open ${module?.title || "module"}`}>
            <GuideIcon name="external" size={15} /><span>Open</span>
          </a>
        ) : null}
      </div>

      {expanded ? (
        <div className="next-sop-module-body" id={`${module.id}-details`}>
          <div className="next-sop-module-meta">
            {destination || module?.route ? <code>{destination || module.route}</code> : <span>In-app guide</span>}
            {Array.isArray(module?.controls) && module.controls.length ? (
              <div className="next-sop-controls">{module.controls.map((item) => <span key={item}>{item}</span>)}</div>
            ) : null}
          </div>

          <div className="next-sop-summary-grid">
            <article><span>Purpose</span><p>{module?.purpose || "—"}</p></article>
            <article><span>When to use</span><p>{module?.whenToUse || "—"}</p></article>
            <article><span>Expected result</span><p>{module?.result || "—"}</p></article>
          </div>

          {flowTotal ? (
            <div className="next-sop-block">
              <div className="next-sop-block-title"><GuideIcon name="workflow" size={14} /> Process flows</div>
              <div className="next-sop-flows">{module.flows.map((flow, index) => <FlowCard flow={flow} index={index} key={`${module.id}-flow-${index}`} />)}</div>
            </div>
          ) : null}

          {stepTotal ? (
            <div className="next-sop-block">
              <div className="next-sop-block-title"><GuideIcon name="list" size={14} /> Recommended workflow</div>
              <div className="next-sop-steps">
                {module.steps.map((step, index) => (
                  <article key={`${module.id}-step-${index}`}>
                    <b>{index + 1}</b><h4>{step?.title || `Step ${index + 1}`}</h4><p>{step?.body || ""}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {ruleTotal ? (
            <div className="next-sop-block">
              <div className="next-sop-block-title"><GuideIcon name="shield" size={14} /> Rules & controls</div>
              <div className="next-sop-rules">{module.rules.map((rule, index) => <article key={`${module.id}-rule-${index}`}><span><GuideIcon name="check" size={14} /></span><p>{rule}</p></article>)}</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function HowItWorksClient({ account }) {
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const modules = useMemo(() => visibleModulesFor(account), [account]);
  const filtered = useMemo(() => {
    const needle = normalize(query);
    return needle ? modules.filter((module) => searchText(module).includes(needle)) : modules;
  }, [modules, query]);

  const flowCount = modules.reduce((sum, module) => sum + (Array.isArray(module?.flows) ? module.flows.length : 0), 0);
  const stepCount = modules.reduce((sum, module) => sum + (Array.isArray(module?.steps) ? module.steps.length : 0), 0);
  const allowedCount = Array.isArray(account?.allowedPages) ? account.allowedPages.length : 0;

  useEffect(() => {
    if (!modules.length) return;
    setExpandedIds((current) => current.size ? current : new Set([modules[0].id]));
  }, [modules]);

  const toggleModule = (id) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const jumpTo = (id) => {
    setExpandedIds((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target = document.getElementById(id);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  };

  const allFilteredExpanded = filtered.length > 0 && filtered.every((module) => expandedIds.has(module.id));
  const toggleAll = () => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (allFilteredExpanded) filtered.forEach((module) => next.delete(module.id));
      else filtered.forEach((module) => next.add(module.id));
      return next;
    });
  };

  return (
    <section className="next-sop-page">
      <article className="next-sop-hero">
        <div className="next-sop-hero-copy">
          <span className="next-sop-eyebrow"><GuideIcon name="book" size={14} /> Operations guide</span>
          <h2>How it works</h2>
          <p>A permission-aware guide for <strong>{account?.name || account?.username || "your account"}</strong>. Search a task, page, rule, proof, or status, then open only the section you need.</p>
          <div className="next-sop-hero-actions">
            <a href="/next/home" className="primary-button"><GuideIcon name="home" size={15} /> Open Home</a>
            <a href="/next/account" className="secondary-button"><GuideIcon name="user" size={15} /> My Account</a>
            <a href="/how-it-works?classic=1" className="secondary-button"><GuideIcon name="external" size={15} /> Classic guide</a>
          </div>
        </div>
        <div className="next-sop-kpis" aria-label="Guide summary">
          <article><span className="next-sop-kpi-icon"><GuideIcon name="layers" size={18} /></span><div><strong>{modules.length}</strong><span>Visible sections</span></div></article>
          <article><span className="next-sop-kpi-icon"><GuideIcon name="workflow" size={18} /></span><div><strong>{flowCount}</strong><span>Process flows</span></div></article>
          <article><span className="next-sop-kpi-icon"><GuideIcon name="list" size={18} /></span><div><strong>{stepCount}</strong><span>Workflow steps</span></div></article>
          <article><span className="next-sop-kpi-icon"><GuideIcon name="shield" size={18} /></span><div><strong>{allowedCount}</strong><span>Allowed pages</span></div></article>
        </div>
      </article>

      <article className="next-sop-toolbar">
        <div className="next-sop-search-wrap">
          <GuideIcon name="search" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages, actions, rules, proofs..."
            aria-label="Search the guide"
          />
          {query ? <button type="button" className="next-sop-search-clear" onClick={() => setQuery("")} aria-label="Clear search">×</button> : null}
        </div>
        <div className="next-sop-toolbar-actions">
          <span className="next-sop-result-count"><strong>{filtered.length}</strong><span>{query ? `of ${modules.length} matched` : "sections"}</span></span>
          {filtered.length ? <button type="button" className="next-sop-expand-button" onClick={toggleAll}><GuideIcon name={allFilteredExpanded ? "minus" : "plus"} size={15} />{allFilteredExpanded ? "Collapse all" : "Expand all"}</button> : null}
        </div>
      </article>

      {filtered.length ? (
        <nav className="next-sop-jumpbar" aria-label="Guide sections">
          {filtered.map((module) => (
            <button type="button" key={`jump-${module.id}`} className={expandedIds.has(module.id) ? "is-active" : ""} onClick={() => jumpTo(module.id)}>{module.title}</button>
          ))}
        </nav>
      ) : null}

      <div className="next-sop-sections">
        {filtered.length ? filtered.map((module) => (
          <ModuleCard module={module} expanded={expandedIds.has(module.id)} onToggle={() => toggleModule(module.id)} key={module.id} />
        )) : (
          <article className="wide-card next-sop-empty">
            <span className="next-sop-empty-icon"><GuideIcon name="search" size={22} /></span>
            <h3>No guide section matched</h3>
            <p>Try a page name, workflow action, proof type, or status.</p>
            <button type="button" className="secondary-button" onClick={() => setQuery("")}>Clear search</button>
          </article>
        )}
      </div>

      <article className="wide-card next-sop-note">
        <span><GuideIcon name="shield" size={17} /></span>
        <div><strong>Permission-aware content</strong><p>The guide is rebuilt from the page access assigned to your account. If Users Center changes your permissions, reload this page to see the latest sections.</p></div>
      </article>
    </section>
  );
}
