export default function LoadingLmsUsersCenter() {
  return (
    <main className="next-lms-users-page">
      <section className="next-lms-users-hero next-lms-skeleton-block">
        <div>
          <span className="next-skeleton next-skeleton--short" />
          <span className="next-skeleton next-skeleton--title" />
          <span className="next-skeleton next-skeleton--line" />
        </div>
      </section>
      <section className="next-lms-users-summary">
        {Array.from({ length: 4 }).map((_, index) => <span className="next-lms-users-loading-card" key={index} />)}
      </section>
      <section className="next-lms-users-loading-grid">
        {Array.from({ length: 6 }).map((_, index) => <span key={index} />)}
      </section>
    </main>
  );
}
