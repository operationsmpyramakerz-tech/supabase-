// ERP_CINEMATIC_STEP6 - B2C route-local motion only.
// /b2c redirects to a permitted workspace; Database, Forms, and table views
// share this CSS while the shell chrome and dialogs remain unchanged.
export default function B2cMotionLayout({ children }) {
  return (
    <>
      <link
        rel="stylesheet"
        href="/next/css/b2c-motion-step6.css?v=cinematic-step6-v1"
        precedence="erp-detail"
      />
      {children}
    </>
  );
}
