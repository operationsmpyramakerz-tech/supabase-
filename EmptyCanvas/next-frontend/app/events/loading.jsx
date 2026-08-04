export default function EventsLoading() {
  return (
    <main className="standalone-state">
      <section className="state-card next-events-loading-card">
        <span className="status-dot" />
        <h1>Opening Events</h1>
        <p>Preparing event requests, workflow states, and schedule details.</p>
        <div className="next-events-loading-grid" aria-hidden="true">
          <span /><span /><span /><span />
        </div>
      </section>
    </main>
  );
}
