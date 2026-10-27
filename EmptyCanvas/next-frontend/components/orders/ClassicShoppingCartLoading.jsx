import ShellStyleLinks from "../ShellStyleLinks";
import { BodyClassSync } from "../ClassicShellControls";
import { ClassicStableLoadingHeader, ClassicStableLoadingSidebar } from "../ClassicStableLoadingChrome";

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
            <section className="classic-cart-page classic-cart-loading-page">
              <div className="classic-cart-type-pill" aria-hidden="true">
                <span className="classic-cart-loading-block classic-cart-loading-block--kicker" />
              </div>
              <div className="classic-cart-loading-grid" aria-hidden="true">
                <div />
                <aside />
              </div>
            </section>
          </main>
        </div>
      </div>
    </>
  );
}
