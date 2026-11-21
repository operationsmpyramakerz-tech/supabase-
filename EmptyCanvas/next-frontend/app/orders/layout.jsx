// ERP Orders motion • route-scoped CSS hoisted ahead of streamed content.
// CSS is scoped to the committed Current Orders workspace, not loading UI.
export default function CurrentOrdersMotionLayout({ children }) {
  return (
    <>
      <link
        rel="stylesheet"
        href="/next/css/current-orders-motion-v1.css?v=cinematic-step2-v1"
        precedence="erp-detail"
      />
      {children}
    </>
  );
}
