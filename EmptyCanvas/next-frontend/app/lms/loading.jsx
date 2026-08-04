export default function Loading() {
  return (
    <main className="next-lms-page" aria-busy="true">
      <section className="next-lms-hero next-lms-skeleton-block">
        <div><span className="next-skeleton next-skeleton--short" /><span className="next-skeleton next-skeleton--title" /><span className="next-skeleton next-skeleton--line" /></div>
      </section>
      <section className="next-lms-kpi-grid">
        {Array.from({ length: 5 }, (_, index) => <div className="next-lms-kpi next-lms-skeleton-block" key={index}><span className="next-skeleton next-skeleton--short" /><span className="next-skeleton next-skeleton--value" /></div>)}
      </section>
      <section className="next-lms-dashboard-grid">
        {Array.from({ length: 4 }, (_, index) => <div className="next-lms-panel next-lms-skeleton-block" key={index}><span className="next-skeleton next-skeleton--title" /><span className="next-skeleton next-skeleton--line" /><span className="next-skeleton next-skeleton--line" /></div>)}
      </section>
    </main>
  );
}
