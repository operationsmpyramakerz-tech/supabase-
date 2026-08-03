export default function LoadingHome() {
  return (
    <main className="standalone-state">
      <section className="state-card loading-card" aria-label="Loading Next.js home">
        <div className="skeleton line short" />
        <div className="skeleton line" />
        <div className="skeleton block" />
      </section>
    </main>
  );
}
