// ERP_CINEMATIC_STEP7 | Kits: route-only animation & streamed loading styles.
// Shared chrome, loading component, permissions and data paths remain unchanged.
export default function KitsMotionLayout({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/next/css/kits-motion-step7.css?v=cinematic-step7-stagger-v2" precedence="erp-detail" />
      <link rel="stylesheet" href="/next/css/kits-create-folder-tile.css?v=kits-black-folder-card-v2" precedence="erp-detail" />
      <link rel="stylesheet" href="/next/css/kits-move-fullwidth-folders.css?v=move-sheet-cards-v1" precedence="erp-detail" />
      <link rel="stylesheet" href="/next/css/kits-move-header-footer-v2.css?v=move-sheet-header-footer-v2" precedence="erp-detail" />
      <link rel="stylesheet" href="/next/css/kits-modern-action-popover.css?v=kits-modern-actions-v1" precedence="erp-detail" />
      <link rel="stylesheet" href="/next/css/kits-folder-create-sheet-and-close-v1.css?v=kits-folder-sheet-x-v1" precedence="erp-detail" />
      <link rel="stylesheet" href="/next/css/kits-multiselect-actions-v1.css?v=kits-multiselect-v1" precedence="erp-detail" />
      <link rel="stylesheet" href="/next/css/kits-create-folder-no-autofill-v2.css?v=2" precedence="erp-detail" />
      <link rel="stylesheet" href="/next/css/erp-kits-proposals-folder-select-fix-v1.css?v=folder-select-fix-v1" precedence="erp-detail" />
      {children}
    </>
  );
}
