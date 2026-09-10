"use client";

import { usePathname } from "next/navigation";

function normalizePath(value) {
  let path = String(value || "").trim();
  if (!path) return "/";

  // The production Next app is mounted under basePath=/next.  usePathname()
  // can expose the route either with or without that prefix depending on the
  // rendering phase, while sidebar hrefs intentionally include /next because
  // they are plain anchors.  Compare both forms in one route space.
  path = path.split("#", 1)[0].split("?", 1)[0] || "/";
  if (path === "/next") path = "/";
  else if (path.startsWith("/next/")) path = path.slice(5) || "/";

  path = path.replace(/\/+$/, "") || "/";
  return path;
}

function resolvedActiveHref(pathname, hrefs) {
  const current = normalizePath(pathname);
  const matches = (Array.isArray(hrefs) ? hrefs : [])
    .map((href) => ({ href, normalized: normalizePath(href) }))
    .filter(({ normalized }) => (
      current === normalized ||
      (normalized !== "/" && current.startsWith(`${normalized}/`))
    ))
    .sort((a, b) => b.normalized.length - a.normalized.length);

  return matches[0]?.href || "";
}

export default function ClassicStableLoadingNavItem({
  href,
  allHrefs = [],
  fallbackActive = false,
  itemClassName = "",
  label = "",
  children,
}) {
  const pathname = usePathname();
  const routeActiveHref = resolvedActiveHref(pathname, allHrefs);
  const active = routeActiveHref ? routeActiveHref === href : fallbackActive;

  return (
    <li className={itemClassName}>
      <span
        className={`nav-link next-stable-loading-nav ${active ? "active" : ""}`}
        title={label || undefined}
      >
        {children}
      </span>
    </li>
  );
}
