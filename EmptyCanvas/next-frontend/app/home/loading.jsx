export default function LoadingHome() {
  return (
    <main className="dashboard-loading" aria-label="Loading dashboard">
      <aside className="loading-sidebar" />
      <section className="loading-main">
        <div className="skeleton loading-header" />
        <div className="loading-grid">{Array.from({ length: 4 }).map((_, index) => <div className="skeleton loading-card" key={index} />)}</div>
        <div className="loading-lower"><div className="skeleton loading-card tall" /><div className="skeleton loading-card tall" /></div>
      </section>
    </main>
  );
}
