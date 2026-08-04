export default function ProductsLoading() {
  return (
    <main className="standalone-state products-loading-page" aria-label="Loading Products">
      <section className="products-loading-shell">
        <div className="products-skeleton products-skeleton--hero" />
        <div className="products-skeleton products-skeleton--toolbar" />
        <div className="products-loading-grid">
          {Array.from({ length: 6 }, (_, index) => <div className="products-skeleton products-skeleton--card" key={index} />)}
        </div>
      </section>
    </main>
  );
}
