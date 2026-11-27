"use client";

import { usePathname } from "next/navigation";

// Match the calendar-only design on all three Task Management views.
// Accept paths with and without the application's /next base path.
export default function TaskCalendarLoadingContent({ children }) {
  const pathname = String(usePathname() || "").replace(/\/+$/, "");
  if (!/^\/(?:next\/)?task-management\/(?:all-tasks|my-tasks|delegated-tasks)$/.test(pathname)) return children;
  const delegatedDesign = /\/delegated-tasks$/.test(pathname);
  return (
    <>
      <link rel="stylesheet" href="/next/css/task-management-next-parity.css?v=classic-parity-v3-workflow" precedence="erp-detail" />
      <link rel="stylesheet" href="/next/css/task-management-calendar-only-v1.css?v=2" precedence="erp-detail" />
      {delegatedDesign ? <link rel="stylesheet" href="/next/css/task-delegated-status-fab-v1.css?v=2" precedence="erp-detail" /> : null}
      <section className="task-management-page next-task-classic-parity classic-task-loading tm-calendar-only-loading" aria-busy="true" aria-label="Loading task calendar">
        <div className="tm-main">
          <section className={`tm-mobile-dashboard${delegatedDesign ? " tm-mobile-dashboard--delegated-final" : ""}`} aria-hidden="true">
            <section className="tm-mobile-week-card">
              <div className="tm-mobile-week-toolbar tm-calendar-only-loading__toolbar"><span /><span /><span /></div>
              <div className="tm-mobile-week-strip">{Array.from({ length: 7 }, (_, i) => <span className="tm-calendar-only-loading__day" key={i} />)}</div>
            </section>
            <section className="tm-mobile-summary-grid">{Array.from({ length: 3 }, (_, i) => <div className={`tm-mobile-summary-card tm-mobile-summary-card--${["not-started", "progress", "done"][i]}`} key={i}>{delegatedDesign ? <><span className="classic-task-loading__line tm-delegated-status-label" /><span className="classic-task-loading__line tm-delegated-status-icon" /><span className="classic-task-loading__line tm-delegated-status-count-placeholder" /></> : <><span className="classic-task-loading__line wide" /><span className="classic-task-loading__line" /><span className="classic-task-loading__line wide" /></>}</div>)}</section>
            <section className="tm-mobile-day-feed">
              <div className="classic-task-loading__line wide" />
              {Array.from({ length: 2 }, (_, i) => <div className="tm-calendar-only-loading__task" key={i}><span /><div><span className="classic-task-loading__line" /><span className="classic-task-loading__line wide" /><span className="classic-task-loading__line" /></div></div>)}
            </section>
          </section>
          <div className="tm-agenda-layout tm-agenda-layout--calendar-only" aria-hidden="true">
            <aside className="tm-agenda-column">
              <section className="tm-agenda-card tm-calendar-card classic-task-loading__calendar"><div className="classic-task-loading__line wide" /><div className="classic-task-loading__calendar-grid">{Array.from({ length: 42 }, (_, i) => <span key={i} />)}</div></section>
              <section className="tm-agenda-card classic-task-loading__day"><div className="classic-task-loading__line" /><div className="classic-task-loading__line wide" /><div className="classic-task-loading__line" /></section>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
