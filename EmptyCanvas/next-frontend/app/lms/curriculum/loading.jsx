export default function LmsCurriculumLoading() {
  return (
    <main className="next-lms-curriculum-page">
      <section className="next-lms-curriculum-hero is-loading">
        <div><span /><h2 /><p /></div><div className="next-lms-curriculum-hero-actions"><i /><i /></div>
      </section>
      <section className="next-lms-curriculum-summary is-loading">
        {Array.from({ length: 4 }, (_, index) => <article key={index}><small /><strong /><span /></article>)}
      </section>
      <section className="next-lms-curriculum-loading-grid">
        {Array.from({ length: 6 }, (_, index) => <article key={index}><span /><h3 /><p /></article>)}
      </section>
    </main>
  );
}
