export default function LoginLoading() {
  return (
    <main className="next-login-page next-login-page-loading">
      <section className="next-login-shell" aria-label="Loading sign in">
        <div className="next-login-brand-panel">
          <div className="next-login-brand-mark next-login-skeleton" />
          <div className="next-login-brand-copy">
            <div className="next-login-skeleton next-login-skeleton-line wide" />
            <div className="next-login-skeleton next-login-skeleton-line" />
          </div>
        </div>
        <div className="next-login-card">
          <div className="next-login-skeleton next-login-skeleton-line wide" />
          <div className="next-login-skeleton next-login-skeleton-field" />
          <div className="next-login-skeleton next-login-skeleton-field" />
          <div className="next-login-skeleton next-login-skeleton-button" />
        </div>
      </section>
    </main>
  );
}
