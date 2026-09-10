import { BodyClassSync } from "../ClassicShellControls";
import { ClassicStableLoadingHeader, ClassicStableLoadingSidebar } from "../ClassicStableLoadingChrome";

function LoadingTypeCard() {
  return (
    <div className="classic-cart-order-type-btn classic-cart-order-type-btn--loading" aria-hidden="true">
      <span className="classic-cart-order-type-icon classic-cart-loading-block classic-cart-loading-block--icon" />
      <span className="classic-cart-order-type-copy">
        <span className="classic-cart-loading-block classic-cart-loading-block--title" />
        <span className="classic-cart-loading-block classic-cart-loading-block--copy" />
        <span className="classic-cart-loading-block classic-cart-loading-block--copy-short" />
      </span>
      <span className="classic-cart-order-type-arrow classic-cart-loading-block classic-cart-loading-block--arrow" />
    </div>
  );
}

export default function ClassicShoppingCartLoading() {
  return (
    <>
      <link rel="stylesheet" href="/css/style.css?v=bidi-mixed-v1" />
      <link rel="stylesheet" href="/css/ui-redesign.css?v=sidebar-page-label-frame-v3" />
      <link rel="stylesheet" href="/css/page-canvas-fix.css?v=page-canvas-single-layer-v3" />
      <BodyClassSync className="shopping-cart-page next-classic-shell-active" />

      <div className="app-container classic-app-shell next-classic-orders-loading" aria-label="Loading Shopping Cart">
        <ClassicStableLoadingSidebar activeIndex={6} />
        <div className="main-content">
          <ClassicStableLoadingHeader title="Shopping Cart" />

          {/* The settled Shopping Cart renders .classic-cart-page as a child of
              the shared AppShell <main>. Keep the loading state in that same
              hierarchy so the 1rem canvas padding + 1rem page padding do not
              collapse into one another during navigation. */}
          <main className="container-full-width next-classic-page-content">
            <section className="classic-cart-page classic-cart-loading-page-stable">
              <section className="classic-cart-order-type-step classic-cart-loading-order-type-step" aria-hidden="true">
                <div className="classic-cart-order-step-header">
                  <div>
                    <span className="classic-cart-order-step-kicker classic-cart-loading-kicker">
                      <span className="classic-cart-loading-block classic-cart-loading-block--kicker" />
                    </span>
                    <div className="classic-cart-loading-block classic-cart-loading-block--heading" />
                  </div>
                </div>
                <div className="classic-cart-order-type-tabs">
                  <LoadingTypeCard />
                  <LoadingTypeCard />
                  <LoadingTypeCard />
                </div>
              </section>
            </section>
          </main>
        </div>
      </div>
    </>
  );
}
