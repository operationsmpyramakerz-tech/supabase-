import { BodyClassSync } from "../ClassicShellControls";
import { ClassicStableLoadingHeader, ClassicStableLoadingSidebar } from "../ClassicStableLoadingChrome";

function LoadingCard() {
  return (
    <article className="co-card next-classic-order-card-loading" aria-hidden="true">
      <div className="co-top">
        <div className="co-thumb next-classic-order-loading-thumb" />
        <div className="co-main">
          <span className="next-classic-order-loading-line next-classic-order-loading-line--title" />
          <span className="next-classic-order-loading-line next-classic-order-loading-line--sub" />
        </div>
        <span className="next-classic-order-loading-qty" />
      </div>
      <div className="co-divider" />
      <div className="co-bottom">
        <span className="next-classic-order-loading-line next-classic-order-loading-line--total" />
        <span className="next-classic-order-loading-pill" />
        <span className="next-classic-order-loading-circle" />
      </div>
    </article>
  );
}

function layoutFor(bodyClass = "") {
  if (bodyClass.includes("operations-orders-page")) {
    return {
      rootClass: "next-classic-orders-parity next-classic-operations-parity",
      toolbarWrapClass: "next-operations-orders-toolbar-wrap",
      surfaceClass: "operations-orders-list-surface next-classic-orders-loading-section",
      surfaceId: "operations-orders-list",
      listId: "requested-list",
    };
  }
  if (bodyClass.includes("maintenance-orders")) {
    return {
      rootClass: "next-classic-orders-parity next-classic-maintenance-parity",
      toolbarWrapClass: "next-maintenance-orders-toolbar-wrap",
      surfaceClass: "next-maintenance-orders-list-surface next-classic-orders-loading-section",
      surfaceId: undefined,
      listId: "requested-list",
    };
  }
  if (bodyClass.includes("orders-review-page")) {
    return {
      rootClass: "next-classic-orders-parity",
      toolbarWrapClass: "next-orders-review-toolbar-wrap",
      surfaceClass: "orders-review-list-surface next-classic-orders-loading-section",
      surfaceId: "sv-orders",
      listId: "sv-list",
    };
  }
  return {
    rootClass: "next-classic-orders-parity",
    toolbarWrapClass: "next-current-orders-toolbar-wrap",
    surfaceClass: "card next-classic-orders-loading-section",
    surfaceId: "current-orders",
    listId: "orders-list",
  };
}

export default function ClassicOrdersLoading({ title = "Current Orders", bodyClass = "current-orders-page", activeIndex = 2, tabs = 7 }) {
  const layout = layoutFor(bodyClass);

  return (
    <>
      <link rel="stylesheet" href="/css/style.css?v=bidi-mixed-v1" />
      <link rel="stylesheet" href="/css/ui-redesign.css?v=sidebar-page-label-frame-v3" />
      <link rel="stylesheet" href="/css/page-canvas-fix.css?v=page-canvas-single-layer-v3" />
      <BodyClassSync className={`order-modal-fit-screen ${bodyClass} next-classic-shell-active`} />

      <div className="app-container classic-app-shell next-classic-orders-loading" aria-label={`Loading ${title}`}>
        <ClassicStableLoadingSidebar activeIndex={activeIndex} />

        <div className="main-content">
          <ClassicStableLoadingHeader title={title} />

          {/* Match the settled AppShell hierarchy exactly: the page-specific
              orders wrapper lives INSIDE the shared main canvas, not on the
              <main> itself. This keeps padding/insets identical while loading. */}
          <main className="container-full-width next-classic-page-content">
            <section className={layout.rootClass}>
              <div className={layout.toolbarWrapClass}>
                <div className="orders-toolbar next-classic-orders-loading-toolbar" aria-hidden="true">
                  <div className="orders-toolbar__scroll">
                    <div className="portfolio-tabs portfolio-tabs--iconic">
                      {Array.from({ length: tabs }).map((_, index) => (
                        <span className={`tab-portfolio order-status-tab ${index === 0 ? "active" : ""}`} key={index}>
                          <span className="order-status-tab__icon next-classic-order-loading-tab-icon" />
                          <span className="order-status-tab__copy"><span className="next-classic-order-loading-tab-label" /></span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="orders-toolbar__divider" />
                  <div className="orders-type-filter">
                    <span className="orders-type-filter__button next-classic-order-loading-filter">
                      <span className="next-classic-order-loading-tab-icon" />
                      <span className="next-classic-order-loading-tab-label" />
                    </span>
                  </div>
                </div>
              </div>

              <section className={layout.surfaceClass} id={layout.surfaceId}>
                <div className="co-cards" id={layout.listId}>
                  {Array.from({ length: 8 }).map((_, index) => <LoadingCard key={index} />)}
                </div>
              </section>
            </section>
          </main>
        </div>
      </div>
    </>
  );
}
