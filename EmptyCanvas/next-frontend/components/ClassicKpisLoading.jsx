import ShellStyleLinks from "./ShellStyleLinks";
import { BodyClassSync } from "./ClassicShellControls";
import { ClassicStableLoadingHeader, ClassicStableLoadingSidebar } from "./ClassicStableLoadingChrome";

const SIDEBAR_ITEMS = 18;

export default function ClassicKpisLoading() {
  return (
    <>
      <ShellStyleLinks />
      <link rel="stylesheet" href="/next/css/kpis.css?v=next-stage-2l-kpis" />
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
