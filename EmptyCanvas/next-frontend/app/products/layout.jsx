// ERP_CINEMATIC_STEP6 - Products route-local animation and loading polish.
// Does not modify the shared layout, permissions or catalogue behaviour.
export default function ProductsMotionLayout({ children }) {
  return (
    <>
      <link
        rel="stylesheet"
        href="/next/css/products-motion-step6.css?v=cinematic-step6-v1"
        precedence="erp-detail"
      />
      {children}
    </>
  );
}
