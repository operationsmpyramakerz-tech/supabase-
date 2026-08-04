export default function UsersCenterLoading() {
  return (
    <main className="next-users-loading" aria-label="Loading Users Center">
      <section className="loading-block next-users-loading-hero" />
      <section className="next-users-loading-stats">
        <span className="loading-block" /><span className="loading-block" /><span className="loading-block" /><span className="loading-block" />
      </section>
      <section className="next-users-loading-grid">
        {Array.from({ length: 8 }).map((_, index) => <span className="loading-block" key={index} />)}
      </section>
    </main>
  );
}
