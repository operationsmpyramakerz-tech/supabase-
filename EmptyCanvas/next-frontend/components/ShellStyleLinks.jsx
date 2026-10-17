"use client";

import { usePersistentShellContext } from "./PersistentShellContext";

const SHELL_STYLES = Object.freeze([
  "/next/css/style.css?v=boot-main51-v1",
  "/next/css/ui-redesign.css?v=boot-main51-v1",
  "/next/css/page-canvas-fix.css?v=boot-main51-v1",
  "/next/css/classic-parity.css?v=boot-main51-v1",
]);

export default function ShellStyleLinks() {
  const persistentShell = usePersistentShellContext();

  // RootLayout owns one long-lived AppShell now. Loading fallbacks still render
  // their Classic shell markup for geometry compatibility, but they live inside
  // PersistentShellProvider and must not inject the same ~1 MB shell styles a
  // second time on every App Router navigation.
  if (persistentShell?.persistent) return null;

  return <>{SHELL_STYLES.map((href) => <link rel="stylesheet" href={href} key={href} precedence="erp-shell" />)}</>;
}
