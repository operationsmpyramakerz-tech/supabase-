"use client";

import { BodyClassSync } from "./ClassicShellControls";
import { ClassicStableLoadingHeader, ClassicStableLoadingSidebar } from "./ClassicStableLoadingChrome";

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
        <ClassicStableLoadingSidebar activeIndex={15} />
        <div className="main-content">
          <ClassicStableLoadingHeader title={"KPIs"} />
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
