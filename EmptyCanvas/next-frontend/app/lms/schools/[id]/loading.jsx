export default function LoadingLmsSchoolWorkspace() {
  return (
    <main className="next-lms-school-page" aria-busy="true">
      <section className="next-lms-school-hero is-loading"><div><span /><h2 /><p /><i /></div></section>
      <section className="next-lms-school-summary is-loading">{Array.from({ length: 5 }, (_, index) => <article key={index}><small /><strong /><span /></article>)}</section>
      <section className="next-lms-school-loading-layout"><aside>{Array.from({ length: 7 }, (_, index) => <span key={index} />)}</aside><div>{Array.from({ length: 3 }, (_, index) => <article key={index}><h3 /><p /><i /></article>)}</div></section>
    </main>
  );
}
