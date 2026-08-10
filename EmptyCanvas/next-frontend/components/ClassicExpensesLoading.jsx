"use client";

import { BodyClassSync } from "./ClassicShellControls";

const SIDEBAR_ITEMS = 18;

export default function ClassicExpensesLoading({ users = false }) {
  const title = users ? "Expenses Users" : "Expenses";
  const bodyClass = users ? "expenses-users-page" : "expenses-page";
  const activeIndex = users ? 14 : 13;

  return (
    <>
      <link rel="stylesheet" href="/css/style.css?v=bidi-mixed-v1" />
      <link rel="stylesheet" href="/css/ui-redesign.css?v=sidebar-page-label-frame-v3" />
      <link rel="stylesheet" href="/css/page-canvas-fix.css?v=page-canvas-single-layer-v3" />
      {!users ? <link rel="stylesheet" href="/css/expenses-redesign.css?v=expenses-dashboard-v2" /> : null}
      <link rel="stylesheet" href={users ? "/next/css/expenses-users-classic-inline.css?v=stage2f" : "/next/css/expenses-classic-inline.css?v=stage2f"} />
      <BodyClassSync className={`${bodyClass} next-classic-shell-active`} />

      <div className="app-container classic-app-shell next-classic-expenses-loading" aria-label={`Loading ${title}`}>
        <aside className="sidebar" aria-hidden="true">
          <div className="sidebar-header"><div className="sidebar-brand-toggle next-classic-loading-brand"><img className="brand-logo-full" src="/images/Logo%20horizontal.png" alt="" /><img className="brand-logo-icon" src="/images/logo.png" alt="" /></div></div>
          <nav className="sidebar-nav"><ul className="nav-list">{Array.from({ length: SIDEBAR_ITEMS }).map((_, index) => <li key={index} className={index === 1 || index === 17 ? `sidebar-${index === 1 ? "workspace" : "users"}-boundary` : ""}><span className={`nav-link next-classic-loading-nav ${index === activeIndex ? "active" : ""}`}><span className="next-classic-loading-nav-icon" /></span></li>)}</ul></nav>
        </aside>
        <div className="main-content">
          <header className="main-header dash-header dash-hide-row2"><div className="header-row1"><div className="left"><div className="menu-toggle next-classic-loading-menu"><img className="menu-toggle-logo" src="/images/logo.png" alt="" /></div><div className="dash-title">{title}</div><div className="searchbar next-classic-loading-search"><span className="next-classic-loading-line" /></div></div><div className="right topbar-right"><span className="next-classic-loading-circle" /><span className="next-classic-loading-avatar" /></div></div></header>
          <main className="container-full-width next-classic-page-content">
            {users ? (
              <div className="expenses-layout next-expense-users-classic-parity"><div className="user-tabs">{Array.from({ length: 6 }).map((_, index) => <span className="user-tab next-expenses-loading-user-card" key={index}><span className="next-expenses-loading-line wide"/><span className="user-tab__divider"/><span className="next-expenses-loading-line amount"/><span className="next-expenses-loading-line"/></span>)}</div></div>
            ) : (
              <div className="expenses-layout expenses-dashboard next-expenses-classic-parity"><aside className="expenses-dashboard__sidebar"><span className="expenses-summary-card next-expenses-loading-panel"/><span className="expenses-analytics-card next-expenses-loading-panel chart"/><span className="expenses-analytics-card next-expenses-loading-panel donut"/></aside><section className="expenses-dashboard__main"><div className="expense-action-grid"><span className="next-expenses-loading-action"/><span className="next-expenses-loading-action"/></div><span className="expenses-activity-card next-expenses-loading-ledger"/></section></div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
