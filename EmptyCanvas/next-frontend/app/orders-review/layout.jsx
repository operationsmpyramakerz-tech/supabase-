// Orders Review motion is route-scoped; no change to loading skeleton or shell.
export default function OrdersReviewMotionLayout({ children }) {
  return (
    <>
      <link
        rel="stylesheet"
        href="/next/css/orders-review-motion-v1.css?v=cinematic-step3-v1"
        precedence="erp-detail"
      />
      {children}
    </>
  );
}
