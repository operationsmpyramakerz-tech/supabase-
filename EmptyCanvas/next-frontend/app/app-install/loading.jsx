export default function AppInstallLoading() {
  return (
    <section className="app-install-loading" aria-label="Loading app install center">
      <article><span /><b /><em /></article>
      <div>{Array.from({ length: 4 }, (_, index) => <article key={index}><span /><b /><em /></article>)}</div>
    </section>
  );
}
