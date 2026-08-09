export default function LoginLoading() {
  return (
    <>
      <link rel="stylesheet" href="/css/login.css?v=concept-2-pulse-settle-v1" />
      <div className="login-container" aria-label="Loading sign in">
        <div className="login-card next-classic-login-loading-card">
          <div className="login-header">
            <span className="login-logo-stage">
              <img src="/images/logo.png" alt="Logo" className="login-logo" />
            </span>
            <img src="/images/pyramakerz-wordmark.png" alt="Pyramakerz" className="login-wordmark" />
            <h1 className="login-brand-title">Pyramakerz</h1>
            <p className="login-subtitle" aria-hidden="true" />
          </div>
          <div className="login-form next-classic-login-loading-form">
            <div className="next-classic-login-loading-field" />
            <div className="next-classic-login-loading-field" />
            <div className="next-classic-login-loading-link" />
            <div className="next-classic-login-loading-button" />
          </div>
        </div>
      </div>
    </>
  );
}
