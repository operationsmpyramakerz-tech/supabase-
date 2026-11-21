// ERP_CINEMATIC_STEP8: independent per-user motion, nested under Expenses route.
export default function ExpensesUsersMotionLayout({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/next/css/expenses-users-motion-step8.css?v=cinematic-step8-visibility-v2" precedence="erp-detail" />
      {children}
    </>
  );
}
