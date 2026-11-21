// ERP_CINEMATIC_STEP10: User Profile only; header, sidebar, bottom bar unchanged.
export default function AccountMotionLayout({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/next/css/account-motion-step10.css?v=cinematic-step10-v1" precedence="erp-detail" />
      {children}
    </>
  );
}
