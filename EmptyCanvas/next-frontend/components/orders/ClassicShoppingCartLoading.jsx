"use client";

import { BodyClassSync } from "../ClassicShellControls";
import { ClassicStableLoadingHeader, ClassicStableLoadingSidebar } from "../ClassicStableLoadingChrome";

const SIDEBAR_ITEMS = 18;

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
          <ClassicStableLoadingHeader title={"Shopping Cart"} />
          <main className="container-full-width next-classic-page-content classic-cart-loading-page">
            <section className="classic-cart-loading-type" aria-hidden="true" />
            <div className="classic-cart-loading-grid" aria-hidden="true"><div/><aside/></div>
          </main>
        </div>
      </div>
    </>
  );
}
