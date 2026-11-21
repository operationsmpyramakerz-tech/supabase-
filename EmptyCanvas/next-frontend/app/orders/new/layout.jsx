// Route-only motion for all three Shopping Cart flows and their loading state.
// Do not animate shared header, navigation, dialogs or the bottom dock.
export default function ShoppingCartMotionLayout({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/next/css/shopping-cart-motion-v1.css?v=cinematic-step5-v1" precedence="erp-detail" />
      {children}
    </>
  );
}
