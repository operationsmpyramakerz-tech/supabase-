const SHELL_STYLES = Object.freeze([
  "/next/css/style.css?v=bidi-mixed-v1",
  "/next/css/ui-redesign.css?v=sidebar-page-label-frame-v3",
  "/next/css/page-canvas-fix.css?v=page-canvas-single-layer-v3",
  "/next/css/classic-parity.css?v=classic-parity-scoped-v1",
]);

export default function ShellStyleLinks() {
  return <>{SHELL_STYLES.map((href) => <link rel="stylesheet" href={href} key={href} />)}</>;
}
