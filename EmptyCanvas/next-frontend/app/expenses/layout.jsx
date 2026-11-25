// ERP_CINEMATIC_STEP8: route-only Expenses motion. No shared chrome changes.
export default function ExpensesMotionLayout({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/next/css/expenses-motion-step8.css?v=cinematic-step8-v1" precedence="erp-detail" />
      <link rel="stylesheet" href="/next/css/expenses-other-destination-v1.css?v=1" precedence="erp-detail" />
      {children}
    </>
  );
}
