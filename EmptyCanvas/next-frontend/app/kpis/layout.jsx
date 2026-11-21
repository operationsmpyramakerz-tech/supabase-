// ERP_CINEMATIC_STEP9: KPIs route-only animation.
export default function KpisMotionLayout({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/next/css/kpis-motion-step9.css?v=cinematic-step9-v1" precedence="erp-detail" />
      {children}
    </>
  );
}
