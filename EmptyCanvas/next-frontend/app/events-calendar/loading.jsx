export default function EventsCalendarLoading() {
  return (
    <main className="standalone-state">
      <section className="state-card next-events-calendar-loading-card">
        <span className="status-dot" />
        <h1>Preparing Event Calendar</h1>
        <p>Loading the monthly schedule and upcoming events.</p>
        <div className="next-events-calendar-loading-grid" aria-hidden="true">
          {Array.from({ length: 14 }).map((_, index) => <span key={index} />)}
        </div>
      </section>
    </main>
  );
}
