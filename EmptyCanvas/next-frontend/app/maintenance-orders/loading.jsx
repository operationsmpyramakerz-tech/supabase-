export default function MaintenanceOrdersLoading() {
  return (
    <main className="standalone-state orders-page-loading">
      <section className="state-card wide-card">
        <div className="skeleton-line wide" />
        <div className="skeleton-line medium" />
        <div className="orders-loading-toolbar skeleton-block" />
        <div className="orders-loading-grid">
          {Array.from({ length: 6 }, (_, index) => <div className="orders-loading-card skeleton-block" key={index} />)}
        </div>
      </section>
    </main>
  );
}
