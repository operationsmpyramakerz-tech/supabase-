export default function LmsSchoolsLoading() {
  return (
    <main className="next-lms-schools-page" aria-busy="true">
      <section className="next-lms-schools-hero next-lms-schools-skeleton"><div /><div /></section>
      <section className="next-lms-schools-summary">
        {Array.from({ length: 4 }, (_, index) => <article className="next-lms-schools-skeleton" key={index}><div /><div /></article>)}
      </section>
      <section className="next-lms-schools-grid">
        {Array.from({ length: 8 }, (_, index) => <article className="next-lms-school-card next-lms-schools-skeleton" key={index}><div /><div /><div /></article>)}
      </section>
    </main>
  );
}
