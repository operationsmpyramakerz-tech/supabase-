"use client";

import { BodyClassSync } from "../../components/ClassicShellControls";
import { ClassicStableLoadingHeader, ClassicStableLoadingSidebar } from "../../components/ClassicStableLoadingChrome";

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
        <ClassicStableLoadingSidebar activeIndex={0} />

        <div className="main-content">
          <ClassicStableLoadingHeader title="Home" />

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
