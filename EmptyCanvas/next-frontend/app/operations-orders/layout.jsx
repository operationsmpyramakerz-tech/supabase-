// ERP Operations Orders motion • applies to Request Products, Withdraw Products,
// and Request Maintenance. The existing /operations-orders redirect is unchanged.
export default function OperationsOrdersMotionLayout({ children }) {
  return (
    <>
      <link
        rel="stylesheet"
        href="/next/css/operations-orders-motion-v1.css?v=cinematic-step2-v1"
        precedence="erp-detail"
      />
      {children}
    </>
  );
}
