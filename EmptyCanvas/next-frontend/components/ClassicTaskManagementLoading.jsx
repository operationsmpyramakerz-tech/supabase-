"use client";

import { BodyClassSync } from "./ClassicShellControls";

const SIDEBAR_ITEMS = 18;

export default function ClassicTaskManagementLoading() {
  return (
    <>
      <link rel="stylesheet" href="/css/style.css?v=bidi-mixed-v1" />
      <link rel="stylesheet" href="/css/ui-redesign.css?v=sidebar-page-label-frame-v3" />
      <link rel="stylesheet" href="/css/page-canvas-fix.css?v=page-canvas-single-layer-v3" />
      <link rel="stylesheet" href="/css/task-management.css?v=next-stage-2j" />
      <BodyClassSync className="task-management-page next-classic-shell-active" />
      <div className="app-container classic-app-shell next-classic-task-loading" aria-label="Loading Task Management">
        <aside className="sidebar" aria-hidden="true">
          <div className="sidebar-header"><div className="sidebar-brand-toggle next-classic-loading-brand"><img className="brand-logo-full" src="/images/Logo%20horizontal.png" alt="" /><img className="brand-logo-icon" src="/images/logo.png" alt="" /></div></div>
          <nav className="sidebar-nav"><ul className="nav-list">{Array.from({ length: SIDEBAR_ITEMS }).map((_, index) => <li key={index} className={index === 1 || index === 17 ? `sidebar-${index === 1 ? "workspace" : "users"}-boundary` : ""}><span className={`nav-link next-classic-loading-nav ${index === 5 ? "active" : ""}`}><span className="next-classic-loading-nav-icon" /></span></li>)}</ul></nav>
        </aside>
        <div className="main-content">
          <header className="main-header dash-header dash-hide-row2"><div className="header-row1"><div className="left"><div className="menu-toggle next-classic-loading-menu"><img className="menu-toggle-logo" src="/images/logo.png" alt="" /></div><div className="dash-title">Task Management</div><div className="searchbar next-classic-loading-search"><span className="next-classic-loading-line" /></div></div><div className="right topbar-right"><span className="next-classic-loading-circle" /><span className="next-classic-loading-avatar" /></div></div></header>
          <main className="container-full-width next-classic-page-content">
            <section className="next-task-page task-management-page classic-task-loading">
              <div className="next-task-viewbar classic-task-loading__viewbar"><div><span /><span /><span /></div><div><span /><span /></div></div>
              <div className="next-task-layout tm-agenda-layout">
                <aside className="next-task-agenda tm-agenda-column">
                  <section className="tm-agenda-card tm-calendar-card classic-task-loading__calendar"><div className="classic-task-loading__line wide" /><div className="classic-task-loading__calendar-grid">{Array.from({ length: 35 }, (_, i) => <span key={i} />)}</div></section>
                  <section className="tm-agenda-card classic-task-loading__day"><div className="classic-task-loading__line" /><div className="classic-task-loading__line wide" /><div className="classic-task-loading__line" /></section>
                </aside>
                <section className="tm-tasks-column"><div className="tm-toolbar tm-orders-toolbar classic-task-loading__toolbar"><span /><span /><span /><span /><span /></div><div className="tm-ticket-grid">{Array.from({ length: 4 }, (_, i) => <article className="tm-ticket-card classic-task-loading__ticket" key={i}><div className="classic-task-loading__line wide" /><div className="classic-task-loading__line" /><div className="classic-task-loading__line wide" /></article>)}</div></section>
              </div>
            </section>
          </main>
        </div>
      </div>
    </>
  );
}
