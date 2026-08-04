export default function KpisLoading() {
  return (
    <section className="next-kpis-loading" aria-label="Loading KPIs">
      <div className="loading-block next-kpis-loading-hero" />
      <div className="next-kpis-loading-grid">
        <div className="loading-block" />
        <div className="loading-block" />
      </div>
      <div className="next-kpis-loading-grid next-kpis-loading-grid--wide">
        <div className="loading-block" />
        <div className="loading-block" />
      </div>
    </section>
  );
}
