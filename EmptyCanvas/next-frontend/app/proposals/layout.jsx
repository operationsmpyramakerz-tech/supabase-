// ERP_CINEMATIC_STEP7 | Proposals: route-only animation & streamed loading.
// No changes to header, sidebar, dock, modals, database or business logic.
export default function ProposalsMotionLayout({ children }) {
  return (
    <>
      <link rel="stylesheet" href="/next/css/proposals-motion-step7.css?v=cinematic-step7-stagger-v2" precedence="erp-detail" />
      <link rel="stylesheet" href="/next/css/proposals-nested-folders-v1.css?v=proposals-folder-library-v1" precedence="erp-detail" />
      <link rel="stylesheet" href="/next/css/proposals-kits-full-parity-v2.css?v=proposals-kits-full-parity-v2" precedence="erp-detail" />
      <link rel="stylesheet" href="/next/css/erp-kits-proposals-folder-select-fix-v1.css?v=folder-select-fix-v1" precedence="erp-detail" />
      {children}
    </>
  );
}
