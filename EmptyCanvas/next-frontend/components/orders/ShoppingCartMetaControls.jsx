"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function Chevron({ direction = "down" }) {
  const path = direction === "left" ? "m15 18-6-6 6-6" : direction === "right" ? "m9 18 6-6-6-6" : "m6 9 6 6 6-6";
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path}/></svg>;
}

function CalendarIcon() {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>;
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

export function ShoppingCartPrioritySelect({ value = "Normal", onChange }) {
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
    <button type="button" ref={menu.triggerRef} className={`classic-cart-meta-trigger${menu.open ? " is-open" : ""}`} aria-label={`Priority Level: ${value}`} aria-haspopup="listbox" aria-controls={menu.open ? listId : undefined} aria-expanded={menu.open} onClick={() => { if (!menu.open) menu.updatePosition(); menu.setOpen((current) => !current); }}>
      <span className={`classic-cart-priority-dot is-${String(value).toLowerCase()}`}/><strong>{value}</strong><Chevron/>
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

function parseDate(value) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!parts) return null;
  const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  if (date.getFullYear() !== Number(parts[1]) || date.getMonth() !== Number(parts[2]) - 1 || date.getDate() !== Number(parts[3])) return null;
  return date;
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function ShoppingCartDeliveryDate({ value = "", onChange }) {
  const menu = useFloatingMenu({ width: 316, estimatedHeight: 380 });
  const dialogId = useId();
  const [month, setMonth] = useState(() => monthStart(parseDate(value) || new Date()));
  const selected = parseDate(value);
  const today = new Date();

  useEffect(() => {
    if (menu.open) setMonth(monthStart(parseDate(value) || new Date()));
  }, [menu.open, value]);

  const firstDayOffset = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const totalSlots = Math.ceil((firstDayOffset + daysInMonth) / 7) * 7;
  const days = Array.from({ length: totalSlots }, (_, index) => {
    const day = index - firstDayOffset + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
  const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(month);
  const formatted = selected ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(selected) : "Select date";
  const choose = (date) => { onChange?.(date ? isoDate(date) : ""); menu.close(); };
  const shiftMonth = (delta) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  return <div className="classic-cart-meta-picker">
    <button type="button" ref={menu.triggerRef} className={`classic-cart-meta-trigger classic-cart-date-trigger${menu.open ? " is-open" : ""}`} aria-label={`Delivery Date: ${selected ? formatted : "Not selected"}`} aria-haspopup="dialog" aria-expanded={menu.open} aria-controls={menu.open ? dialogId : undefined} onClick={() => { if (!menu.open) menu.updatePosition(); menu.setOpen((current) => !current); }}>
      <CalendarIcon/><strong className={!selected ? "is-placeholder" : undefined}>{formatted}</strong><Chevron/>
    </button>
    {menu.open && typeof document !== "undefined" ? createPortal(
      <div ref={menu.menuRef} id={dialogId} className="classic-cart-meta-popover classic-cart-date-menu" role="dialog" aria-modal="false" aria-label="Choose delivery date" style={menu.position}>
        <div className="classic-cart-date-month">
          <strong>{monthLabel}</strong>
          <span className="classic-cart-date-month-arrows">
            <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}><Chevron direction="left"/></button>
            <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}><Chevron direction="right"/></button>
          </span>
        </div>
        <div className="classic-cart-date-grid">
          {WEEKDAYS.map((day) => <span className="classic-cart-date-weekday" key={day}>{day}</span>)}
          {days.map((day, index) => {
            if (!day) return <span key={`empty-${index}`} aria-hidden="true"/>;
            const date = new Date(month.getFullYear(), month.getMonth(), day);
            const isSelected = !!selected && isoDate(selected) === isoDate(date);
            const isToday = isoDate(today) === isoDate(date);
            return <button type="button" key={`day-${day}`} className={`classic-cart-date-day${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`} aria-label={new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date)} aria-pressed={isSelected} onClick={() => choose(date)}>{day}</button>;
          })}
        </div>
        <div className="classic-cart-date-actions">
          <button type="button" onClick={() => choose(null)}>Clear</button>
          <button type="button" onClick={() => choose(new Date())}>Today</button>
        </div>
      </div>, document.body
    ) : null}
  </div>;
}
