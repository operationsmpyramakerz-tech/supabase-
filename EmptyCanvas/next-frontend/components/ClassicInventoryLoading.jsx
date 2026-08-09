"use client";

import { BodyClassSync } from "./ClassicShellControls";

const SIDEBAR_ITEMS = 18;

export default function ClassicInventoryLoading({ title, bodyClass, activeIndex, products = false }) {
  return (
    <>
      <link rel="stylesheet" href="/css/style.css?v=bidi-mixed-v1" />
      <link rel="stylesheet" href="/css/ui-redesign.css?v=sidebar-page-label-frame-v3" />
      <link rel="stylesheet" href="/css/page-canvas-fix.css?v=page-canvas-single-layer-v3" />
      {products ? <link rel="stylesheet" href="/css/products.css?v=products-manual-image-v1" /> : null}
      <BodyClassSync className={`${bodyClass} next-classic-shell-active`} />

      <div className="app-container classic-app-shell next-classic-inventory-loading" aria-label={`Loading ${title}`}>
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
                  <span className={`nav-link next-classic-loading-nav ${index === activeIndex ? "active" : ""}`}><span className="next-classic-loading-nav-icon" /></span>
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
            {products ? (
              <section className="products-shell next-products-classic-parity">
                <section className="products-filter-panel"><div className="products-tag-filter-wrap"><div className="products-tag-filter-btn next-inventory-shimmer" /></div></section>
                <section className="products-results">
                  {Array.from({ length: 3 }).map((_, group) => (
                    <section className="products-group next-inventory-loading-product-group" key={group}>
                      <header className="products-group__head"><span className="next-inventory-shimmer next-inventory-loading-title" /><span className="next-inventory-shimmer next-inventory-loading-action" /></header>
                      <div className="products-grid">{Array.from({ length: 8 }).map((__, item) => <span className="next-inventory-shimmer next-inventory-loading-product" key={item} />)}</div>
                    </section>
                  ))}
                </section>
              </section>
            ) : (
              <section className="card">
                <div className="card-toolbar"><span className="next-inventory-shimmer next-inventory-loading-download" /></div>
                <div className="groups-grid">{Array.from({ length: 4 }).map((_, group) => <section className="card card--elevated group-card next-inventory-loading-stock-card" key={group}><div className="group-card__head"><span className="next-inventory-shimmer next-inventory-loading-title" /><span className="next-inventory-shimmer next-inventory-loading-count" /></div><div className="group-table-wrap"><div className="next-inventory-loading-table">{Array.from({ length: 5 }).map((__, row) => <span className="next-inventory-shimmer" key={row} />)}</div></div></section>)}</div>
              </section>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
