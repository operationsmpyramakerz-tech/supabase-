"use client";

import { BodyClassSync } from "./ClassicShellControls";

const SIDEBAR_ITEMS = 18;

export default function ClassicB2cLoading({ mode = "library" }) {
  const table = mode === "table";
  const bodyClass = `b2c-page ${table ? "b2c-table-view-page" : "b2c-database-page b2c-library-page"} next-classic-shell-active`;
  return (
    <>
      <link rel="stylesheet" href="/css/style.css?v=bidi-mixed-v1" />
      <link rel="stylesheet" href="/css/ui-redesign.css?v=sidebar-page-label-frame-v3" />
      <link rel="stylesheet" href="/css/page-canvas-fix.css?v=page-canvas-single-layer-v3" />
      <link rel="stylesheet" href="/css/b2c.css?v=b2c-formula-calculator-v2" />
      <BodyClassSync className={bodyClass} />
      <div className="app-container classic-app-shell next-classic-b2c-loading" aria-label={table ? "Loading B2C table" : "Loading B2C Database"}>
        <aside className="sidebar" aria-hidden="true">
          <div className="sidebar-header"><div className="sidebar-brand-toggle next-classic-loading-brand"><img className="brand-logo-full" src="/images/Logo%20horizontal.png" alt="" /><img className="brand-logo-icon" src="/images/logo.png" alt="" /></div></div>
          <nav className="sidebar-nav"><ul className="nav-list">{Array.from({ length: SIDEBAR_ITEMS }).map((_, index) => <li key={index} className={index === 1 || index === 17 ? `sidebar-${index === 1 ? "workspace" : "users"}-boundary` : ""}><span className={`nav-link next-classic-loading-nav ${index === 9 ? "active" : ""}`}><span className="next-classic-loading-nav-icon" /></span></li>)}</ul></nav>
        </aside>
        <div className="main-content">
          <header className="main-header dash-header dash-hide-row2"><div className="header-row1"><div className="left"><div className="menu-toggle next-classic-loading-menu"><img className="menu-toggle-logo" src="/images/logo.png" alt="" /></div><div className="dash-title">Database</div><div className="searchbar next-classic-loading-search"><span className="next-classic-loading-line" /></div></div><div className="right topbar-right"><span className="next-classic-loading-circle" /><span className="next-classic-loading-avatar" /></div></div></header>
          <main className="container-full-width next-classic-page-content">
            <main className="b2c-shell">
              {table ? (
                <section className="b2c-table-workspace next-b2c-loading-table-classic">
                  <div className="b2c-table-view-head b2c-table-view-head--compact"><span className="next-b2c-loading-line-wide" /><div className="b2c-top-actions"><span className="next-b2c-loading-button" /><span className="next-b2c-loading-button" /><span className="next-b2c-loading-button" /></div></div>
                  <div className="b2c-table-insights"><article /><article /><article /></div>
                  <section className="b2c-detail-table-panel"><div className="next-b2c-loading-table-head" />{Array.from({ length: 6 }).map((_, index) => <div className="next-b2c-loading-table-row" key={index} />)}</section>
                </section>
              ) : (
                <section className="b2c-library-workspace next-b2c-loading-library-classic"><div className="b2c-library-workspace__head"><div /><div className="b2c-top-actions"><span className="next-b2c-loading-button" /><span className="next-b2c-loading-button next-b2c-loading-button-primary" /></div></div><section className="b2c-folders-panel"><div className="b2c-folders-grid">{Array.from({ length: 6 }).map((_, index) => <div className="b2c-folder-card" key={index}><span className="b2c-folder next-b2c-loading-folder"><span className="b2c-folder__figure"><span className="b2c-folder__paper b2c-folder__paper--left" /><span className="b2c-folder__paper b2c-folder__paper--middle" /><span className="b2c-folder__paper b2c-folder__paper--right" /></span></span></div>)}</div></section></section>
              )}
            </main>
          </main>
        </div>
      </div>
    </>
  );
}
