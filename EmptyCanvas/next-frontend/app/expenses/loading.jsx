export default function ExpensesLoading() {
  return (
    <main className="standalone-state expenses-loading-page" aria-busy="true">
      <section className="expenses-loading-shell">
        <div className="loading-block expenses-loading-summary" />
        <div className="expenses-loading-grid">
          <div className="loading-block" />
          <div className="loading-block" />
          <div className="loading-block" />
          <div className="loading-block" />
        </div>
      </section>
    </main>
  );
}
