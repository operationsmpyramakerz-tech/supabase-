"use client";

import { useEffect, useRef, useState } from "react";

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function HeaderSearch({ title = "this page" }) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!expanded) return undefined;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [expanded]);

  const clearSearch = () => {
    const input = inputRef.current;
    if (!input) return;
    if (input.value) {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };

  const closeSearch = () => {
    clearSearch();
    setExpanded(false);
  };

  const toggleSearch = () => {
    if (expanded) {
      closeSearch();
      return;
    }
    setExpanded(true);
  };

  return (
    <div className={`searchbar system-header-search${expanded ? " is-expanded" : ""}`} role="search">
      <button
        type="button"
        className="system-header-search__toggle"
        onClick={toggleSearch}
        aria-label={expanded ? "Close search" : `Search in ${title}`}
        aria-expanded={expanded}
        title={expanded ? "Close search" : "Search"}
      >
        <SearchIcon />
      </button>
      <input
        ref={inputRef}
        className="system-header-search__input"
        type="search"
        placeholder="Search"
        aria-label={`Search in ${title}`}
        tabIndex={expanded ? 0 : -1}
        onKeyDown={(event) => {
          if (event.key === "Escape") closeSearch();
        }}
      />
      <button
        type="button"
        className="system-header-search__close"
        onClick={closeSearch}
        aria-label="Close search"
        title="Close search"
        tabIndex={expanded ? 0 : -1}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
