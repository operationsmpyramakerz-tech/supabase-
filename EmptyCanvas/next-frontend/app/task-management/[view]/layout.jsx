// ERP_CINEMATIC_STEP9: Task Management views only (All / My / Delegated).
export default function TaskManagementMotionLayout({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/next/css/task-management-motion-step9.css?v=cinematic-step9-v1" precedence="erp-detail" />
      {children}
    </>
  );
}
