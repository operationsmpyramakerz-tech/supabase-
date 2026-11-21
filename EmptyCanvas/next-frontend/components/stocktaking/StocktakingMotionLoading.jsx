import ShellStyleLinks from "../ShellStyleLinks";
import { BodyClassSync } from "../ClassicShellControls";
import { ClassicStableLoadingHeader, ClassicStableLoadingSidebar } from "../ClassicStableLoadingChrome";

// Stocktaking-only skeleton, avoiding changes to shared Products loading UI.
export default function StocktakingMotionLoading() {
  return (
    <>
      <ShellStyleLinks />
      <BodyClassSync className="stocktaking-page next-classic-shell-active" />
      <div className="app-container classic-app-shell next-classic-inventory-loading" aria-label="Loading Stocktaking">
        <ClassicStableLoadingSidebar activeIndex={7} />
        <div className="main-content">
          <ClassicStableLoadingHeader title="Stocktaking" />
          <main className="container-full-width next-classic-page-content">
            <section className="erp-stocktaking-skeleton" aria-busy="true" aria-label="Loading stock folders">
              <span className="erp-stock-motion-sr-only" role="status">Loading Stocktaking…</span>
              <div className="erp-stock-loading-card">
                <div className="erp-stock-loading-header" aria-hidden="true">
                  <span className="erp-stock-sk" /><span className="erp-stock-sk" /><span className="erp-stock-sk" />
                </div>
                <div className="erp-stock-loading-grid" aria-hidden="true">
                  {Array.from({ length: 8 }, (_, index) => (
                    <div className="erp-stock-loading-folder" key={index}>
                      <div className="erp-stock-loading-folder-top"><span className="erp-stock-sk erp-stock-loading-folder-paper" /></div>
                      <div className="erp-stock-loading-folder-front">
                        <span className="erp-stock-sk" /><span className="erp-stock-sk" /><span className="erp-stock-sk" />
                      </div>
                    </div>
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
