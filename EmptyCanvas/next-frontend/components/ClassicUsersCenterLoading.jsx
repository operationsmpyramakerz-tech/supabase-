"use client";

import { BodyClassSync } from "./ClassicShellControls";

const SIDEBAR_ITEMS = 18;

export default function ClassicUsersCenterLoading() {
  return (
    <>
      <link rel="stylesheet" href="/css/style.css?v=bidi-mixed-v1" />
      <link rel="stylesheet" href="/css/ui-redesign.css?v=sidebar-page-label-frame-v3" />
      <link rel="stylesheet" href="/css/page-canvas-fix.css?v=page-canvas-single-layer-v3" />
      <link rel="stylesheet" href="/css/user-access.css?v=next-stage-2m-users-center" />
      <BodyClassSync className="user-access-page next-classic-shell-active" />
      <div className="app-container classic-app-shell next-classic-users-loading" aria-label="Loading Users Center">
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
                  <span className={`nav-link next-classic-loading-nav ${index === 17 ? "active" : ""}`}>
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
                <div className="dash-title">Users Center</div>
                <div className="searchbar next-classic-loading-search"><span className="next-classic-loading-line" /></div>
              </div>
              <div className="right topbar-right"><span className="next-classic-loading-circle" /><span className="next-classic-loading-avatar" /></div>
            </div>
          </header>

          <main className="container-full-width next-classic-page-content">
            <section className="ua-page-body">
              <section className="ua-folders-panel">
                <div className="ua-section-head ua-section-head--folders ua-section-head--folders-actions-only">
                  <div className="ua-folder-actions next-ua-loading-actions">
                    <span className="next-ua-loading-pill" />
                    <span className="next-ua-loading-button" />
                    <span className="next-ua-loading-button" />
                  </div>
                </div>
                <div className="ua-folders next-ua-loading-folders">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <article className="ua-folder" key={index}>
                      <span className="ua-folder__icon next-ua-loading-square" />
                      <span className="next-ua-loading-copy"><i /><i /></span>
                    </article>
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
