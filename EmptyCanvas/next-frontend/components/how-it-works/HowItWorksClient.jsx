"use client";

import { useMemo, useState } from "react";
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

function FlowCard({ flow, index }) {
  const steps = Array.isArray(flow?.steps) ? flow.steps : [];
  return (
    <article className="next-sop-flow-card">
      <header>
        <div><span>Flow {index + 1}</span><h4>{flow?.title || `Process ${index + 1}`}</h4></div>
        {flow?.outcome ? <em>{flow.outcome}</em> : null}
      </header>
      {flow?.summary ? <p>{flow.summary}</p> : null}
      <div className="next-sop-flow-track">
        {steps.map((step, stepIndex) => {
          const label = typeof step === "string" ? step : (step?.label || step?.title || `Step ${stepIndex + 1}`);
          const note = typeof step === "string" ? "" : (step?.note || step?.body || "");
          return <div className="next-sop-flow-step" key={`${label}-${stepIndex}`}><b>{stepIndex + 1}</b><strong>{label}</strong>{note ? <small>{note}</small> : null}</div>;
        })}
      </div>
    </article>
  );
}

function ModuleCard({ module }) {
  const destination = routeFor(module);
  return (
    <section className="next-sop-module" id={module.id}>
      <div className="next-sop-module-head">
        <div className="next-sop-module-title">
          <span className="next-sop-module-icon">{String(module?.title || "G").slice(0, 1)}</span>
          <div><small>{module?.eyebrow || "Guide"}</small><h3>{module?.title || "Guide section"}</h3><p>{module?.overview || ""}</p></div>
        </div>
        <div className="next-sop-route-wrap">
          <code>{destination || module?.route || "In-app guide"}</code>
          {destination ? <a href={destination}>Open module →</a> : null}
        </div>
      </div>

      {Array.isArray(module?.controls) && module.controls.length ? <div className="next-sop-controls">{module.controls.map((item) => <span key={item}>{item}</span>)}</div> : null}

      <div className="next-sop-summary-grid">
        <article><span>Purpose</span><p>{module?.purpose || "—"}</p></article>
        <article><span>When to use</span><p>{module?.whenToUse || "—"}</p></article>
        <article><span>Expected result</span><p>{module?.result || "—"}</p></article>
      </div>

      {Array.isArray(module?.flows) && module.flows.length ? <div className="next-sop-block"><div className="next-sop-block-title">Process flows</div><div className="next-sop-flows">{module.flows.map((flow, index) => <FlowCard flow={flow} index={index} key={`${module.id}-flow-${index}`} />)}</div></div> : null}

      {Array.isArray(module?.steps) && module.steps.length ? <div className="next-sop-block"><div className="next-sop-block-title">Recommended workflow</div><div className="next-sop-steps">{module.steps.map((step, index) => <article key={`${module.id}-step-${index}`}><b>{index + 1}</b><h4>{step?.title || `Step ${index + 1}`}</h4><p>{step?.body || ""}</p></article>)}</div></div> : null}

      {Array.isArray(module?.rules) && module.rules.length ? <div className="next-sop-block"><div className="next-sop-block-title">Rules & controls</div><div className="next-sop-rules">{module.rules.map((rule, index) => <article key={`${module.id}-rule-${index}`}><span>✓</span><p>{rule}</p></article>)}</div></div> : null}
    </section>
  );
}

export default function HowItWorksClient({ account }) {
  const [query, setQuery] = useState("");
  const modules = useMemo(() => visibleModulesFor(account), [account]);
  const filtered = useMemo(() => {
    const needle = normalize(query);
    return needle ? modules.filter((module) => searchText(module).includes(needle)) : modules;
  }, [modules, query]);

  const flowCount = modules.reduce((sum, module) => sum + (Array.isArray(module?.flows) ? module.flows.length : 0), 0);
  const stepCount = modules.reduce((sum, module) => sum + (Array.isArray(module?.steps) ? module.steps.length : 0), 0);

  const jumpTo = (id) => {
    const target = typeof document !== "undefined" ? document.getElementById(id) : null;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="next-sop-page">
      <article className="next-sop-hero">
        <div>
          <span className="pill">Permission-aware operations guide</span>
          <h2>How the Operations Hub works for {account?.name || account?.username || "your account"}</h2>
          <p>This guide keeps the original S.O.P content, but now it is rendered inside the Next.js workspace and filtered to the pages currently assigned to your account.</p>
          <div className="next-sop-hero-actions"><a href="/next/home" className="primary-button">Open Home</a><a href="/next/account" className="secondary-button">My Account</a><a href="/how-it-works" className="secondary-button">Classic guide</a></div>
        </div>
        <div className="next-sop-kpis">
          <article><strong>{modules.length}</strong><span>Visible sections</span></article>
          <article><strong>{flowCount}</strong><span>Process flows</span></article>
          <article><strong>{stepCount}</strong><span>Workflow steps</span></article>
          <article><strong>{Array.isArray(account?.allowedPages) ? account.allowedPages.length : 0}</strong><span>Allowed pages</span></article>
        </div>
      </article>

      <article className="next-sop-toolbar">
        <label><span>Search the guide</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages, actions, rules, proofs..." /></label>
        <div><strong>{filtered.length}</strong><span>{query ? ` of ${modules.length} matched` : " sections available"}</span></div>
      </article>

      <div className="next-sop-jumpbar" aria-label="Guide sections">
        {filtered.map((module) => <button type="button" key={`jump-${module.id}`} onClick={() => jumpTo(module.id)}>{module.title}</button>)}
      </div>

      <div className="next-sop-sections">
        {filtered.length ? filtered.map((module) => <ModuleCard module={module} key={module.id} />) : <article className="wide-card next-sop-empty"><h3>No guide section matched</h3><p>Try a page name, workflow action, proof type, or status.</p><button type="button" className="secondary-button" onClick={() => setQuery("")}>Clear search</button></article>}
      </div>

      <article className="wide-card next-sop-note">
        <strong>Permission-aware content</strong>
        <p>If Users Center changes your page access, reload this page to rebuild the guide from the latest account permissions. Shared rules, Home, and Account remain visible to every signed-in user.</p>
      </article>
    </section>
  );
}
