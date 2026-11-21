// Route-only motion for Stocktaking's folders, workspace, and loading state.
// Existing product pages and shared shell remain unchanged.
export default function StocktakingMotionLayout({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/next/css/stocktaking-motion-v1.css?v=cinematic-step5-v1" precedence="erp-detail" />
      {children}
    </>
  );
}
