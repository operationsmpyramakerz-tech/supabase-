// Maintenance Orders motion is route-scoped; no change to dialogs or shell.
export default function MaintenanceOrdersMotionLayout({ children }) {
  return (
    <>
      <link
        rel="stylesheet"
        href="/next/css/maintenance-orders-motion-v1.css?v=cinematic-step3-v1"
        precedence="erp-detail"
      />
      {children}
    </>
  );
}
