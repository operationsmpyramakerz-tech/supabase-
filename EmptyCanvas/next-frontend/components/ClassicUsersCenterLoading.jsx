import { BodyClassSync } from "./ClassicShellControls";
import { ClassicStableLoadingHeader, ClassicStableLoadingSidebar } from "./ClassicStableLoadingChrome";

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
        <ClassicStableLoadingSidebar activeIndex={16} />
        <div className="main-content">
          <ClassicStableLoadingHeader title={"Users Center"} />
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
