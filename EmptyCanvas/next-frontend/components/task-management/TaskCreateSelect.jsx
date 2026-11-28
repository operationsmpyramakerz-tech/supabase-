"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

const keyFor = (value) => String(value || "normal").toLowerCase();

function Chevron() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>;
}

function Check() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>;
}

// Creation forms only. Reuse the ERP select styling, but never invoke the
// platform's native select dialog. Option values retain the existing API format.
export default function TaskCreateSelect({ label, value, options, onChange, placeholder = "Select", priority = false, disabled = false }) {
  const id = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const focusIndex = useRef(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ up: false, height: 260 });
  const selectedIndex = options.findIndex((option) => String(option.value) === String(value));
  const selected = options[selectedIndex];

  function close(restore = false) {
    setOpen(false);
    if (restore) trigger.current?.focus({ preventScroll: true });
  }

  function choose(option) {
    onChange(String(option.value));
    close(true);
  }

  function openMenu(index = null) {
    focusIndex.current = index;
    setOpen(true);
  }

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const position = () => {
      const button = trigger.current?.getBoundingClientRect();
      if (!button) return;
      const scroll = root.current?.closest(".tm-create-sheet-scroll");
      const surface = scroll?.getClientRects().length ? scroll : root.current?.closest(".tm-create-sheet");
      const bounds = surface?.getBoundingClientRect();
      const top = Math.max(0, bounds?.top ?? 0);
      const bottom = Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight);
      const below = bottom - button.bottom - 12;
      const above = button.top - top - 12;
      const desired = Math.min(260, options.length * 47 + 18);
      const up = below < desired && above > below;
      setPlacement({ up, height: Math.max(74, Math.min(260, Math.floor(up ? above : below))) });
    };
    position();
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    return () => {
      window.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("resize", position);
    };
  }, [open, options.length]);

  useLayoutEffect(() => {
    if (!open || !menu.current) return;
    const index = focusIndex.current;
    if (index !== null) {
      const option = menu.current.children[index];
      if (option) {
        option.focus({ preventScroll: true });
        option.scrollIntoView({ block: "nearest" });
      }
    } else if (selectedIndex >= 0) {
      const option = menu.current.children[selectedIndex];
      if (option) menu.current.scrollTop = Math.max(0, option.offsetTop - 8);
    }
    focusIndex.current = null;
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (root.current && !root.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside, true);
    };
  }, [open]);

  function handleKey(event, index) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (index >= 0 && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      choose(options[index]);
      return;
    }
    if (event.key === "Tab" && open) {
      // Move from the trigger to the next form field in normal tab order.
      close(true);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || !options.length) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
      : index < 0 ? (selectedIndex >= 0 ? selectedIndex : event.key === "ArrowUp" ? options.length - 1 : 0)
      : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
    if (!open) openMenu(next);
    else {
      const option = menu.current?.children[next];
      option?.focus({ preventScroll: true });
      option?.scrollIntoView({ block: "nearest" });
    }
  }

  return <div ref={root} className={`tm-select tm-create-select${priority ? " tm-select--priority" : ""}${open ? " is-open" : ""}${placement.up ? " is-dropup" : ""}`}>
    <button ref={trigger} type="button" className={`tm-select__button${selected ? "" : " is-placeholder"}`} aria-label={`${label}: ${selected?.label || placeholder}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} data-priority={priority && selected ? keyFor(selected.value) : ""} disabled={disabled || !options.length} onClick={() => open ? close() : openMenu()} onKeyDown={(event) => handleKey(event, -1)}>
      <span className="tm-select__value">{priority && selected && <span className={`tm-priority-marker tm-priority-marker--${keyFor(selected.value)}`} aria-hidden="true"/>}<span className="tm-create-select__label">{selected?.label || placeholder}</span></span>
      <span className="tm-select__chevron"><Chevron/></span>
    </button>
    {open && <div id={id} className="tm-select__menu" ref={menu} role="listbox" aria-label={label} style={{ maxHeight: placement.height }}>
      {options.map((option, index) => <div key={option.value} className={`tm-select__option${selectedIndex === index ? " is-selected" : ""}${priority ? ` tm-select__option--priority tm-select__option--${keyFor(option.value)}` : ""}`} role="option" aria-selected={selectedIndex === index} tabIndex={-1} onClick={() => choose(option)} onKeyDown={(event) => handleKey(event, index)}>
        <span className="tm-select__option-main">{priority && <span className={`tm-priority-marker tm-priority-marker--${keyFor(option.value)}`} aria-hidden="true"/>}<span>{option.label}</span></span>
        {selectedIndex === index && <Check/>}
      </div>)}
    </div>}
  </div>;
}
