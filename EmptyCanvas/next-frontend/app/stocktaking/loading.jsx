export default function StocktakingLoading() {
  return (
    <section className="next-stock-page stock-loading-page" aria-label="Loading stocktaking">
      <div className="stock-summary-grid">
        {Array.from({ length: 4 }, (_, index) => <div className="stock-skeleton stock-skeleton--summary" key={index} />)}
      </div>
      <div className="stock-skeleton stock-skeleton--toolbar" />
      <div className="stock-group-grid">
        {Array.from({ length: 4 }, (_, index) => <div className="stock-skeleton stock-skeleton--group" key={index} />)}
      </div>
    </section>
  );
}
