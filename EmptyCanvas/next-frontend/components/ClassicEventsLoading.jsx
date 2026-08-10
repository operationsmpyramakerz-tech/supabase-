"use client";

import { BodyClassSync } from "./ClassicShellControls";

const SIDEBAR_ITEMS = 18;

export default function ClassicEventsLoading({ mode = "requests" }) {
  const title = mode === "components" ? "Event Components" : mode === "calendar" ? "Event Calendar" : mode === "form" ? "New Event Request" : "Events";
  return (
    <>
      <link rel="stylesheet" href="/css/style.css?v=bidi-mixed-v1" />
      <link rel="stylesheet" href="/css/ui-redesign.css?v=sidebar-page-label-frame-v3" />
      <link rel="stylesheet" href="/css/page-canvas-fix.css?v=page-canvas-single-layer-v3" />
      <link rel="stylesheet" href="/css/events.css?v=next-stage-2k-events" />
      <BodyClassSync className="events-page next-classic-shell-active" />
      <div className="app-container classic-app-shell next-classic-events-loading" aria-label={`Loading ${title}`}>
        <aside className="sidebar" aria-hidden="true">
          <div className="sidebar-header"><div className="sidebar-brand-toggle next-classic-loading-brand"><img className="brand-logo-full" src="/images/Logo%20horizontal.png" alt="" /><img className="brand-logo-icon" src="/images/logo.png" alt="" /></div></div>
          <nav className="sidebar-nav"><ul className="nav-list">{Array.from({ length: SIDEBAR_ITEMS }).map((_, index) => <li key={index}><span className={`nav-link next-classic-loading-nav ${index === 10 ? "active" : ""}`}><span className="next-classic-loading-nav-icon" /></span></li>)}</ul></nav>
        </aside>
        <div className="main-content">
          <header className="main-header dash-header dash-hide-row2"><div className="header-row1"><div className="left"><div className="menu-toggle next-classic-loading-menu"><img className="menu-toggle-logo" src="/images/logo.png" alt="" /></div><div className="dash-title">{title}</div><div className="searchbar next-classic-loading-search"><span className="next-classic-loading-line" /></div></div><div className="right topbar-right"><span className="next-classic-loading-circle" /><span className="next-classic-loading-avatar" /></div></div></header>
          <main className="container-full-width next-classic-page-content">
            {mode === "calendar" ? (
              <section className="events-shell events-calendar-shell"><div className="events-calendar-workspace classic-events-loading__workspace"><div className="events-calendar-workspace__top"><span className="classic-events-loading__line" /><span className="classic-events-loading__button" /></div><div className="events-calendar-layout"><section className="events-calendar-card"><div className="classic-events-loading__line wide" /><div className="classic-events-loading__calendar">{Array.from({length:35},(_,i)=><span key={i}/>)}</div></section><aside className="events-calendar-sidebar"><section className="events-calendar-events-card classic-events-loading__list">{Array.from({length:5},(_,i)=><span key={i}/>)}</section></aside></div></div></section>
            ) : mode === "form" ? (
              <section className="events-shell events-shell--form">{Array.from({length:5},(_,i)=><section className="events-form-section classic-events-loading__form-section" key={i}><div className="classic-events-loading__line wide" /><div className="classic-events-loading__fields"><span/><span/><span/><span/></div></section>)}</section>
            ) : (
              <section className={`events-shell ${mode === "components" ? "events-panel events-components-workspace" : "events-request-workspace"}`}><div className="events-orders-toolbar classic-events-loading__tabs">{Array.from({length:5},(_,i)=><span key={i}/>)}</div><div className={mode === "components" ? "events-component-cards" : "events-request-cards"}>{Array.from({length:mode === "components" ? 6 : 4},(_,i)=><article className={mode === "components" ? "events-component-card classic-events-loading__component" : "events-request-card co-card classic-events-loading__request"} key={i}><div className="classic-events-loading__line wide"/><div className="classic-events-loading__line"/><div className="classic-events-loading__line wide"/></article>)}</div></section>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
