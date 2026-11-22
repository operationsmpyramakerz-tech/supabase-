// ERP_CINEMATIC_STEP9: Users Center route-only animation.
export default function UsersCenterMotionLayout({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/next/css/users-center-motion-step9.css?v=cinematic-step9-v1" precedence="erp-detail" />
      <link rel="stylesheet" href="/next/css/users-center-stocktaking-folder-access-v1.css?v=stock-folder-visibility-v1" precedence="erp-detail" />
      {children}
    </>
  );
}
