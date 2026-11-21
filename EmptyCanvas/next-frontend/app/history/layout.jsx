// ERP_CINEMATIC_STEP10: History only; header, sidebar, bottom bar unchanged.
export default function HistoryMotionLayout({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/next/css/history-motion-step10.css?v=cinematic-step10-v1" precedence="erp-detail" />
      {children}
    </>
  );
}
