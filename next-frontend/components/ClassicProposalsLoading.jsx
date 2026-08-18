"use client";

import { BodyClassSync } from "./ClassicShellControls";

const SIDEBAR_ITEMS = 18;
const CONTENT_BLOCKS = 6;

export default function ClassicProposalsLoading({ title = "Proposals", kits = false }) {
  const activeIndex = kits ? 11 : 12;
  const bodyClass = `products-page proposals-page${kits ? " kits-page" : ""} next-classic-shell-active`;

  return (
    <>
      <link rel="stylesheet" href="/css/style.css?v=bidi-mixed-v1" />
      <link rel="stylesheet" href="/css/ui-redesign.css?v=sidebar-page-label-frame-v3" />
      <link rel="stylesheet" href="/css/page-canvas-fix.css?v=page-canvas-single-layer-v3" />
      <link rel="stylesheet" href="/css/products.css?v=products-manual-image-v1" />
      <link rel="stylesheet" href="/css/proposals.css?v=b2b-addname-transparent-pdf-v1" />
      <BodyClassSync className={bodyClass} />

      <div className="app-container classic-app-shell next-classic-proposals-loading next-classic-route-loading" aria-label={`Loading ${title}`}>
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
                <li key={index} className={index === 1 || index === 17 ? `sidebar-${index === 1 ? "workspace" : "users"}-boundary` : ""}>
                  <span className={`nav-link next-classic-loading-nav ${index === activeIndex ? "active" : ""}`}>
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
                <div className="dash-title">{title}</div>
                <div className="searchbar next-classic-loading-search"><span className="next-classic-loading-line" /></div>
              </div>
              <div className="right topbar-right"><span className="next-classic-loading-circle" /><span className="next-classic-loading-avatar" /></div>
            </div>
          </header>

          <main className="container-full-width next-classic-page-content">
            <section className="next-proposals-loading-layout" aria-busy="true">
              <div className="next-proposals-loading-actions" aria-hidden="true">
                <span className="next-proposals-loading-action" />
              </div>

              <section className="next-proposals-loading-surface" aria-hidden="true">
                <div className="next-proposals-loading-grid">
                  {Array.from({ length: CONTENT_BLOCKS }).map((_, index) => (
                    <span className="next-proposals-loading-card" key={index} />
                  ))}
                </div>
              </section>
            </section>
          </main>
        </div>
      </div>
    </>
  );
}
