"use client";

import { BodyClassSync } from "./ClassicShellControls";

const SIDEBAR_ITEMS = 18;

export default function ClassicKpisLoading() {
  return (
    <>
      <link rel="stylesheet" href="/css/style.css?v=bidi-mixed-v1" />
      <link rel="stylesheet" href="/css/ui-redesign.css?v=sidebar-page-label-frame-v3" />
      <link rel="stylesheet" href="/css/page-canvas-fix.css?v=page-canvas-single-layer-v3" />
      <link rel="stylesheet" href="/css/kpis.css?v=next-stage-2l-kpis" />
      <BodyClassSync className="kpis-page next-classic-shell-active" />
      <div className="app-container classic-app-shell next-classic-kpis-loading" aria-label="Loading KPIs">
        <aside className="sidebar" aria-hidden="true">
          <div className="sidebar-header">
            <div className="sidebar-brand-toggle next-classic-loading-brand">
              <img className="brand-logo-full" src="/images/Logo%20horizontal.png" alt="" />
              <img className="brand-logo-icon" src="/images/logo.png" alt="" />
            </div>
          </div>
          <nav className="sidebar-nav">
            <ul className="nav-list">
              {Array.from({ length: SIDEBAR_ITEMS }).map((_, index) => (
                <li key={index}>
                  <span className={`nav-link next-classic-loading-nav ${index === 16 ? "active" : ""}`}>
                    <span className="next-classic-loading-nav-icon" />
                  </span>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <div className="main-content">
          <header className="main-header dash-header dash-hide-row2">
            <div className="header-row1">
              <div className="left">
                <div className="menu-toggle next-classic-loading-menu"><img className="menu-toggle-logo" src="/images/logo.png" alt="" /></div>
                <div className="dash-title">KPIs</div>
                <div className="searchbar next-classic-loading-search"><span className="next-classic-loading-line" /></div>
              </div>
              <div className="right topbar-right"><span className="next-classic-loading-circle" /><span className="next-classic-loading-avatar" /></div>
            </div>
          </header>
          <main className="container-full-width next-classic-page-content">
            <section className="kpis-main">
              <section className="kpis-hero classic-kpis-loading__hero">
                <span className="classic-kpis-loading__line" />
                <div className="classic-kpis-loading__actions"><span /><span /></div>
              </section>
              <section className="kpis-grid">
                <article className="kpis-card kpis-card--graph">
                  <div className="classic-kpis-loading__line wide" />
                  <div className="classic-kpis-loading__chart">{Array.from({ length: 12 }).map((_, i) => <span key={i} />)}</div>
                </article>
                <article className="kpis-card kpis-card--score">
                  <span className="classic-kpis-loading__line" />
                  <span className="classic-kpis-loading__ring" />
                  <span className="classic-kpis-loading__line" />
                </article>
              </section>
              <section className="kpis-layout">
                <article className="kpis-card">
                  <div className="classic-kpis-loading__line wide" />
                  <div className="classic-kpis-loading__table">{Array.from({ length: 5 }).map((_, i) => <span key={i} />)}</div>
                </article>
                <article className="kpis-card">
                  <div className="classic-kpis-loading__line wide" />
                  <div className="classic-kpis-loading__standards">{Array.from({ length: 4 }).map((_, i) => <span key={i} />)}</div>
                </article>
              </section>
            </section>
          </main>
        </div>
      </div>
    </>
  );
}
