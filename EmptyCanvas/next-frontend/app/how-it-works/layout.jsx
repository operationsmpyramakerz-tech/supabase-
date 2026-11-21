// ERP_CINEMATIC_STEP10: How it works only; header, sidebar, bottom bar unchanged.
export default function HowItWorksMotionLayout({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/next/css/guide-motion-step10.css?v=cinematic-step10-v1" precedence="erp-detail" />
      {children}
    </>
  );
}
