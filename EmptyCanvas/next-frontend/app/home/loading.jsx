"use client";

import { BodyClassSync } from "../../components/ClassicShellControls";

const SIDEBAR_ITEMS = 14;

export default function LoadingHome() {
  return (
    <>
      <link rel="stylesheet" href="/css/style.css?v=bidi-mixed-v1" />
      <link rel="stylesheet" href="/css/ui-redesign.css?v=sidebar-page-label-frame-v3" />
      <link rel="stylesheet" href="/css/page-canvas-fix.css?v=page-canvas-single-layer-v3" />
      <link rel="stylesheet" href="/css/home.css?v=home-expenses-dark-card-v1" />
      <BodyClassSync className="page-home next-classic-shell-active" />

      <div className="app-container classic-app-shell next-classic-home-loading" aria-label="Loading dashboard">
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
                <li key={index} className={index === 1 ? "sidebar-workspace-boundary" : ""}>
                  <span className={`nav-link next-classic-loading-nav ${index === 0 ? "active" : ""}`}>
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
                <div className="dash-title">Home</div>
                <div className="searchbar next-classic-loading-search"><span className="next-classic-loading-line" /></div>
              </div>
              <div className="right topbar-right">
                <span className="next-classic-loading-circle" />
                <span className="next-classic-loading-avatar" />
              </div>
            </div>
          </header>

          <main className="container-full-width next-classic-page-content">
            <section className="card home-card home-card--hero next-classic-loading-home-card">
              <div className="home-section-head">
                <span className="next-classic-loading-title" />
                <span className="next-classic-loading-analysis" />
              </div>
              <div className="stats home-kpis next-classic-loading-kpis">
                {Array.from({ length: 6 }).map((_, index) => <div className="next-classic-loading-kpi" key={index} />)}
              </div>
            </section>
            <section className="home-grid next-classic-loading-grid">
              <div className="next-classic-loading-panel" />
              <div className="next-classic-loading-panel" />
              <div className="next-classic-loading-panel" />
            </section>
          </main>
        </div>
      </div>
    </>
  );
}
