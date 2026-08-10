"use client";

import { BodyClassSync } from "./ClassicShellControls";

const SIDEBAR_ITEMS = 18;

export default function ClassicAccountLoading() {
  return (
    <>
      <link rel="stylesheet" href="/css/style.css?v=bidi-mixed-v1" />
      <link rel="stylesheet" href="/css/ui-redesign.css?v=sidebar-page-label-frame-v3" />
      <link rel="stylesheet" href="/css/page-canvas-fix.css?v=page-canvas-single-layer-v3" />
      <link rel="stylesheet" href="/css/account-classic-inline.css?v=next-stage-2n-account" />
      <BodyClassSync className="page-account next-classic-shell-active" />

      <div className="app-container classic-app-shell next-classic-account-loading" aria-label="Loading User Profile">
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
                  <span className="nav-link next-classic-loading-nav"><span className="next-classic-loading-nav-icon" /></span>
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
                <div className="dash-title">User Profile</div>
                <div className="searchbar next-classic-loading-search"><span className="next-classic-loading-line" /></div>
              </div>
              <div className="right topbar-right"><span className="next-classic-loading-circle" /><span className="next-classic-loading-avatar" /></div>
            </div>
          </header>

          <main className="container-full-width next-classic-page-content">
            <section className="card account-page-shell">
              <div className="account-panel account-panel--profile account-profile-modern account-classic-loading-panel">
                <section className="profile-hero-section">
                  <div className="profile-cover-section"><span className="account-classic-loading-cover" /></div>
                  <div className="profile-identity-block">
                    <div className="profile-avatar-section"><div className="profile-avatar-shell"><span className="account-classic-loading-avatar" /></div></div>
                    <span className="account-classic-loading-line is-name" />
                    <div><span className="account-classic-loading-line is-subtitle" /></div>
                  </div>
                </section>
                <div className="profile-fields-list">
                  {Array.from({ length: 7 }).map((_, index) => (
                    <section className="profile-field-card" key={index}>
                      <span className="account-classic-loading-line" style={{ width: `${92 + (index % 3) * 28}px`, height: "16px" }} />
                      <span className="account-classic-loading-field" />
                    </section>
                  ))}
                </div>
                <section className="profile-files-media-section">
                  <div className="profile-files-media-head"><span className="account-classic-loading-line" style={{ width: "160px" }} /></div>
                  <div className="profile-media-files-grid">
                    <span className="account-classic-loading-file" />
                    <span className="account-classic-loading-file" />
                  </div>
                </section>
              </div>
            </section>
          </main>
        </div>
      </div>
    </>
  );
}
