import { ClassicStableLoadingShell } from "../../components/ClassicStableLoadingChrome";

export default function LoadingHowItWorks() {
  return (
    <ClassicStableLoadingShell title="How it works" bodyClass="how-it-works-page" ariaLabel="Loading How it works">
      <section className="standalone-state">
        <section className="state-card">
          <span className="status-dot" />
          <h1>Preparing your operations guide…</h1>
          <p>Loading the S.O.P sections that match your current access.</p>
        </section>
      </section>
    </ClassicStableLoadingShell>
  );
}
