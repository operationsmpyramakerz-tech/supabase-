import { BodyClassSync } from "./ClassicShellControls";
import { ClassicStableLoadingHeader, ClassicStableLoadingSidebar } from "./ClassicStableLoadingChrome";

const SIDEBAR_ITEMS = 18;

export default function ClassicTaskManagementLoading() {
  return (
    <>
      <link rel="stylesheet" href="/css/style.css?v=bidi-mixed-v1" />
      <link rel="stylesheet" href="/css/ui-redesign.css?v=sidebar-page-label-frame-v3" />
      <link rel="stylesheet" href="/css/page-canvas-fix.css?v=page-canvas-single-layer-v3" />
      <link rel="stylesheet" href="/css/task-management.css?v=next-stage-2j" />
      <BodyClassSync className="task-management-page next-classic-shell-active" />
      <div className="app-container classic-app-shell next-classic-task-loading" aria-label="Loading Task Management">
        <ClassicStableLoadingSidebar activeIndex={14} />
        <div className="main-content">
          <ClassicStableLoadingHeader title={"Task Management"} />
          <main className="container-full-width next-classic-page-content">
            <section className="next-task-page task-management-page classic-task-loading">
              <div className="next-task-viewbar classic-task-loading__viewbar"><div><span /><span /><span /></div><div><span /><span /></div></div>
              <div className="next-task-layout tm-agenda-layout">
                <aside className="next-task-agenda tm-agenda-column">
                  <section className="tm-agenda-card tm-calendar-card classic-task-loading__calendar"><div className="classic-task-loading__line wide" /><div className="classic-task-loading__calendar-grid">{Array.from({ length: 35 }, (_, i) => <span key={i} />)}</div></section>
                  <section className="tm-agenda-card classic-task-loading__day"><div className="classic-task-loading__line" /><div className="classic-task-loading__line wide" /><div className="classic-task-loading__line" /></section>
                </aside>
                <section className="tm-tasks-column"><div className="tm-toolbar tm-orders-toolbar classic-task-loading__toolbar"><span /><span /><span /><span /><span /></div><div className="tm-ticket-grid">{Array.from({ length: 4 }, (_, i) => <article className="tm-ticket-card classic-task-loading__ticket" key={i}><div className="classic-task-loading__line wide" /><div className="classic-task-loading__line" /><div className="classic-task-loading__line wide" /></article>)}</div></section>
              </div>
            </section>
          </main>
        </div>
      </div>
    </>
  );
}
