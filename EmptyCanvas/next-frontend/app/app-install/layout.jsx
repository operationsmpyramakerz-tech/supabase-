// ERP_CINEMATIC_STEP10: App install only; header, sidebar, bottom bar unchanged.
export default function AppInstallMotionLayout({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/next/css/app-install-motion-step10.css?v=cinematic-step10-v1" precedence="erp-detail" />
      {children}
    </>
  );
}
