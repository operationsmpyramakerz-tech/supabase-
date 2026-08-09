export default function OrderReceiptViewerLoading() {
  return (
    <main className="receipt-viewer-loading" aria-busy="true">
      <section><span /><span /><span /></section>
      <div>{Array.from({ length: 6 }).map((_, index) => <article key={index}><i /><b /><em /></article>)}</div>
    </main>
  );
}
