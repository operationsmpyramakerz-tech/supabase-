export default function EventComponentsLoading() {
  return (
    <main className="standalone-state">
      <section className="state-card next-events-loading-card">
        <span className="status-dot" />
        <h1>Opening Event Components</h1>
        <p>Preparing the catalogue, categories, costs, and access controls.</p>
        <div className="next-event-components-loading-grid" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
        </div>
      </section>
    </main>
  );
}
