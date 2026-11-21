// ERP_CINEMATIC_STEP10: Database only; header, sidebar, bottom bar unchanged.
export default function BackupMotionLayout({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/next/css/backup-motion-step10.css?v=cinematic-step10-v1" precedence="erp-detail" />
      {children}
    </>
  );
}
