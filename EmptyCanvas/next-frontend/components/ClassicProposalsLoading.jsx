import { BodyClassSync } from "./ClassicShellControls";
import { ClassicStableLoadingHeader, ClassicStableLoadingSidebar } from "./ClassicStableLoadingChrome";

const SIDEBAR_ITEMS = 18;

export default function ClassicProposalsLoading({ title = "Proposals", kits = false }) {
  const activeIndex = kits ? 11 : 12;
  const bodyClass = `products-page proposals-page${kits ? " kits-page" : ""} next-classic-shell-active`;

  return (
    <>
      <link rel="stylesheet" href="/css/style.css?v=bidi-mixed-v1" />
      <link rel="stylesheet" href="/css/ui-redesign.css?v=sidebar-page-label-frame-v3" />
      <link rel="stylesheet" href="/css/page-canvas-fix.css?v=page-canvas-single-layer-v3" />
      <link rel="stylesheet" href="/css/products.css?v=products-manual-image-v1" />
      <link rel="stylesheet" href="/css/proposals.css?v=b2b-addname-transparent-pdf-v1" />
      <BodyClassSync className={bodyClass} />

      <div className="app-container classic-app-shell next-classic-proposals-loading" aria-label={`Loading ${title}`}>
        <ClassicStableLoadingSidebar activeIndex={kits ? 10 : 11} />
        <div className="main-content">
          <ClassicStableLoadingHeader title={title} />
          <main className="container-full-width next-classic-page-content">
            <section className="next-proposals-route-skeleton" aria-busy="true" aria-label={`Loading ${title} content`}>
              <div className="next-proposals-route-skeleton__toolbar" aria-hidden="true">
                <span className="next-proposals-route-skeleton__action" />
              </div>
              <div className="next-proposals-route-skeleton__surface" aria-hidden="true">
                <div className="next-proposals-route-skeleton__grid">
                  {Array.from({ length: 14 }).map((_, index) => (
                    <span className="next-proposals-route-skeleton__card" key={index} />
                  ))}
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </>
  );
}
