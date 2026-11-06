"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const PRIORITIES = ["Low", "Normal", "High", "Urgent"];

function Chevron({ direction = "down" }) {
  const path = direction === "left" ? "m15 18-6-6 6-6" : direction === "right" ? "m9 18 6-6-6-6" : "m6 9 6 6 6-6";
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path}/></svg>;
}

/** Popovers are portalled to the body to avoid clipping inside the summary card. */
function useFloatingMenu({ width, estimatedHeight }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, width, maxHeight: estimatedHeight });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === "undefined") return;
    const rect = triggerRef.current.getBoundingClientRect();
    const fitWidth = Math.min(width, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - fitWidth - 12));
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const showAbove = below < estimatedHeight && above > below;
    const available = Math.max(100, showAbove ? above - 8 : below - 8);
    const maxHeight = Math.min(estimatedHeight, available);
    const top = showAbove ? Math.max(12, rect.top - 8 - maxHeight) : rect.bottom + 8;
    setPosition({ left, top, width: fitWidth, maxHeight });
  }, [width, estimatedHeight]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const dismissOutside = (event) => {
      if (!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyboard = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", handleKeyboard);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", handleKeyboard);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  return { open, setOpen, position, triggerRef, menuRef, close, updatePosition };
}

export function ShoppingCartPrioritySelect({ value = "", onChange, invalid = false }) {
  const listId = useId();
  const menu = useFloatingMenu({ width: 190, estimatedHeight: 230 });
  const optionRefs = useRef([]);
  useEffect(() => {
    if (menu.open) optionRefs.current[Math.max(0, PRIORITIES.indexOf(value))]?.focus();
  }, [menu.open, value]);
  const onOptionKeyDown = (event, index) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? PRIORITIES.length - 1
      : (index + (event.key === "ArrowDown" ? 1 : -1) + PRIORITIES.length) % PRIORITIES.length;
    optionRefs.current[next]?.focus();
  };
  const choose = (priority) => {
    if (priority !== value) onChange?.(priority);
    menu.close();
  };
  return <div className="classic-cart-meta-picker">
    <button type="button" ref={menu.triggerRef} className={`classic-cart-meta-trigger${menu.open ? " is-open" : ""}${invalid ? " is-validation-error" : ""}`} aria-label={`Priority Level: ${value || "Not selected"}`} aria-required="true" aria-invalid={invalid || undefined} aria-haspopup="listbox" aria-controls={menu.open ? listId : undefined} aria-expanded={menu.open} onClick={() => { if (!menu.open) menu.updatePosition(); menu.setOpen((current) => !current); }}>
      {value ? <span className={`classic-cart-priority-dot is-${String(value).toLowerCase()}`}/> : null}<strong className={!value ? "classic-cart-meta-placeholder" : ""}>{value || "Select priority"}</strong><Chevron/>
    </button>
    {menu.open && typeof document !== "undefined" ? createPortal(
      <div ref={menu.menuRef} id={listId} className="classic-cart-meta-popover classic-cart-priority-menu" role="listbox" aria-label="Priority Level" style={menu.position}>
        {PRIORITIES.map((option, index) => <button key={option} ref={(node) => { optionRefs.current[index] = node; }} type="button" role="option" aria-selected={value === option} className={`classic-cart-priority-option${value === option ? " is-selected" : ""}`} onKeyDown={(event) => onOptionKeyDown(event, index)} onClick={() => choose(option)}>
          <span className={`classic-cart-priority-dot is-${option.toLowerCase()}`}/><span>{option}</span>{value === option ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg> : null}
        </button>)}
      </div>, document.body
    ) : null}
  </div>;
}
