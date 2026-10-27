import ShellStyleLinks from "../../components/ShellStyleLinks";
import { BodyClassSync } from "../../components/ClassicShellControls";
import { ClassicStableLoadingHeader, ClassicStableLoadingSidebar } from "../../components/ClassicStableLoadingChrome";

const SIDEBAR_ITEMS = 14;

export default function LoadingHome() {
  return (
    <>
      <ShellStyleLinks />
      <BodyClassSync className="page-home next-classic-shell-active" />

      <div className="app-container classic-app-shell next-classic-home-loading" aria-label="Loading dashboard">
        <ClassicStableLoadingSidebar activeIndex={0} />

        <div className="main-content">
          <ClassicStableLoadingHeader title="Home" />

          <main className="container-full-width next-classic-page-content">
            <section className="erp-home-dashboard next-home-dashboard-loading" aria-label="Loading workspace overview" aria-busy="true">
              <div className="erp-home-dashboard__header">
                <div className="erp-home-dashboard__heading">
                  <span className="erp-home-dashboard__eyebrow">⌁ OPERATIONS DASHBOARD</span>
                  <h2>Workspace overview</h2>
                  <p>Order counts, values and progress in one place.</p>
                </div>
                <span className="next-home-loading-analysis" aria-hidden="true" />
              </div>
              <div className="erp-home-tiles next-home-loading-tiles">
                {['Current orders', 'Review orders', 'Operations orders', 'Maintenance orders'].map((label, index) => (
                  <div className="erp-home-tile next-home-loading-tile" key={label}>
                    <div className="erp-home-tile__top"><span className={`next-home-loading-icon next-home-loading-icon--${index}`} /><span className="next-home-loading-arrow" /></div>
                    <span className="erp-home-tile__title">{label}</span>
                    <span className="next-home-loading-number" />
                    <span className="next-home-loading-value" />
                    <span className="erp-home-distribution" />
                  </div>
                ))}
              </div>
              <section className="erp-home-focus next-home-loading-focus">
                <div className="erp-home-focus__head">
                  <span className="erp-home-focus__icon" aria-hidden="true">◷</span>
                  <div><h3>Needs follow-up</h3><p>Current status counts across your accessible workspaces</p></div>
                </div>
                <div className="erp-home-focus__items">
                  {['In progress', 'Pending review', 'Pending operations', 'Pending maintenance'].map((label) => (
                    <div className="erp-home-focus__item" key={label}><span className="erp-home-focus__item-label">{label}</span><span className="next-home-loading-count" /></div>
                  ))}
                </div>
              </section>
              <section className="erp-home-backlog next-home-loading-backlog">
                <span className="erp-home-dashboard__eyebrow">◷ OPERATIONAL INSIGHTS</span>
                <h2>Backlog health</h2>
                <div className="next-home-loading-insights">
                  {Array.from({ length: 4 }, (_, index) => <div className="next-home-loading-insight" key={index} />)}
                </div>
              </section>
            </section>
          </main>
        </div>
      </div>
    </>
  );
}
