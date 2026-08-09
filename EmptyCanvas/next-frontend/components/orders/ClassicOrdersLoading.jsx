"use client";

import { BodyClassSync } from "../ClassicShellControls";

const SIDEBAR_ITEMS = 18;

function LoadingCard() {
  return (
    <article className="co-card next-classic-order-card-loading" aria-hidden="true">
      <div className="co-top">
        <div className="co-thumb next-classic-order-loading-thumb" />
        <div className="co-main">
          <span className="next-classic-order-loading-line next-classic-order-loading-line--title" />
          <span className="next-classic-order-loading-line next-classic-order-loading-line--sub" />
        </div>
        <span className="next-classic-order-loading-qty" />
      </div>
      <div className="co-divider" />
      <div className="co-bottom">
        <span className="next-classic-order-loading-line next-classic-order-loading-line--total" />
        <span className="next-classic-order-loading-pill" />
        <span className="next-classic-order-loading-circle" />
      </div>
    </article>
  );
}

export default function ClassicOrdersLoading({ title = "Current Orders", bodyClass = "current-orders-page", activeIndex = 2, tabs = 7 }) {
  return (
    <>
      <link rel="stylesheet" href="/css/style.css?v=bidi-mixed-v1" />
      <link rel="stylesheet" href="/css/ui-redesign.css?v=sidebar-page-label-frame-v3" />
      <link rel="stylesheet" href="/css/page-canvas-fix.css?v=page-canvas-single-layer-v3" />
      <BodyClassSync className={`order-modal-fit-screen ${bodyClass} next-classic-shell-active`} />

      <div className="app-container classic-app-shell next-classic-orders-loading" aria-label={`Loading ${title}`}>
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
              <div className="right topbar-right">
                <span className="next-classic-loading-circle" />
                <span className="next-classic-loading-avatar" />
              </div>
            </div>
          </header>

          <main className="container-full-width next-classic-page-content next-classic-orders-parity">
            <div className="orders-toolbar next-classic-orders-loading-toolbar" aria-hidden="true">
              <div className="orders-toolbar__scroll">
                <div className="portfolio-tabs portfolio-tabs--iconic">
                  {Array.from({ length: tabs }).map((_, index) => (
                    <span className={`tab-portfolio order-status-tab ${index === 0 ? "active" : ""}`} key={index}>
                      <span className="order-status-tab__icon next-classic-order-loading-tab-icon" />
                      <span className="next-classic-order-loading-tab-label" />
                    </span>
                  ))}
                </div>
              </div>
              <div className="orders-toolbar__divider" />
              <div className="orders-type-filter">
                <span className="orders-type-filter__button next-classic-order-loading-filter">
                  <span className="next-classic-order-loading-tab-icon" />
                  <span className="next-classic-order-loading-tab-label" />
                </span>
              </div>
            </div>

            <section className="card next-classic-orders-loading-section">
              <div className="co-cards">
                {Array.from({ length: 8 }).map((_, index) => <LoadingCard key={index} />)}
              </div>
            </section>
          </main>
        </div>
      </div>
    </>
  );
}
