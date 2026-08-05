export default function HistoryLoading() {
  return (
    <main className="next-history-page" aria-busy="true">
      <section className="next-history-loading-hero" />
      <section className="next-history-loading-summary">
        {Array.from({ length: 5 }).map((_, index) => <span key={index} />)}
      </section>
      <section className="next-history-loading-toolbar" />
      <section className="next-history-loading-list">
        {Array.from({ length: 8 }).map((_, index) => <span key={index} />)}
      </section>
    </main>
  );
}
