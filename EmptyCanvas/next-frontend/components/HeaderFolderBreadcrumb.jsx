"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ClassicIcon } from "./AppShell";

// In-page folders do not change the Next.js route. Portal their location into
// the existing persistent header instead of rendering a second page heading.
export default function HeaderFolderBreadcrumb({ segments }) {
  const [header, setHeader] = useState(null);
  useEffect(() => {
    setHeader(document.querySelector(".classic-app-shell .main-header .dash-title"));
  }, []);
  if (!header || !Array.isArray(segments) || segments.length < 2) return null;
  return createPortal(
    <nav className="erp-folder-breadcrumb" aria-label="Current folder path">
      {segments.map((segment, index) => {
        const current = index === segments.length - 1;
        const Component = current ? "span" : "button";
        return <Component
          key={`${index}-${segment.label}`}
          {...(current ? { "aria-current": "page" } : { type: "button", onClick: segment.onClick })}
          className={`erp-folder-breadcrumb__step${current ? " is-current" : ""}`}
          title={segment.label}
        >
          <ClassicIcon name={segment.icon || (index === 0 ? "archive" : "folder-check")} />
          <span className="erp-folder-breadcrumb__text">{segment.label}</span>
        </Component>;
      })}
    </nav>,
    header
  );
}
