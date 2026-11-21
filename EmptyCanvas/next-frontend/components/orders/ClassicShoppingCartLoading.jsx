import ShellStyleLinks from "../ShellStyleLinks";
import { BodyClassSync } from "../ClassicShellControls";
import { ClassicStableLoadingHeader, ClassicStableLoadingSidebar } from "../ClassicStableLoadingChrome";

// Shopping Cart-specific skeleton; keep the stable chrome during route loading.
export default function ClassicShoppingCartLoading() {
  return (
    <>
      <ShellStyleLinks />
      <BodyClassSync className="shopping-cart-page next-classic-shell-active" />
      <div className="app-container classic-app-shell next-classic-orders-loading" aria-label="Loading Shopping Cart">
        <ClassicStableLoadingSidebar activeIndex={6} />
        <div className="main-content">
          <ClassicStableLoadingHeader title="Shopping Cart" />
          <main className="container-full-width next-classic-page-content">
            <section className="erp-cart-skeleton" aria-busy="true" aria-label="Loading Shopping Cart content">
              <span className="erp-motion-sr-only" role="status">Loading Shopping Cart…</span>
              <div className="erp-cart-loading-hero" aria-hidden="true">
                <span className="erp-sk erp-cart-loading-hero-icon" />
                <div className="erp-cart-loading-hero-copy"><span className="erp-sk" /><span className="erp-sk" /></div>
              </div>
              <div className="erp-cart-loading-columns" aria-hidden="true">
                <div className="erp-cart-loading-card erp-cart-loading-rect">
                  <div className="erp-cart-loading-options">
                    {[0, 1].map((i) => (
                      <div className="erp-cart-loading-option" key={i}>
                        <span className="erp-sk" /><span className="erp-sk" /><span className="erp-sk" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="erp-cart-loading-side erp-cart-loading-rect">
                  <div className="erp-cart-loading-card">
                    <span className="erp-sk erp-cart-loading-summary-title" />
                    <div className="erp-cart-loading-summary-numbers"><span className="erp-sk" /><span className="erp-sk" /></div>
                  </div>
                  <div className="erp-cart-loading-card erp-cart-loading-reason">
                    <span className="erp-sk erp-cart-loading-field-label" />
                    <span className="erp-sk erp-cart-loading-field" />
                    <span className="erp-sk erp-cart-loading-field-label" />
                    <span className="erp-sk erp-cart-loading-field" />
                  </div>
                  <span className="erp-sk erp-cart-loading-submit" />
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </>
  );
}
