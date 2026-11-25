"use client";
// ORDER_CONNECTED_STATUS_TABS_V1
import { useLayoutEffect, useRef } from "react";
import ClassicOrderIcon from "./ClassicOrderIcon";
import styles from "./ConnectedOrderStatusTabs.module.css";

// Only the selected status displays a label. Keep every status and its original
// handler; the rail scrolls horizontally rather than truncating long labels.
export default function ConnectedOrderStatusTabs({ tabs, active, onChange, label }) {
  const railRef = useRef(null);
  const focusNext = useRef(false);
  const selectedIndex = Math.max(0, tabs.findIndex(item => item.key === active));
  const selected = tabs[selectedIndex];
  const selectedKey = selected?.key;

  useLayoutEffect(() => {
    const rail = railRef.current;
    const button = rail?.querySelector('[aria-selected="true"]');
    if (!rail || !button) return;
    const outer = rail.getBoundingClientRect();
    const inner = button.getBoundingClientRect();
    // Scroll only this rail, never the entire orders page.
    if (inner.left < outer.left + 8) rail.scrollLeft += inner.left - outer.left - 8;
    else if (inner.right > outer.right - 8) rail.scrollLeft += inner.right - outer.right + 8;
    if (focusNext.current) { focusNext.current = false; button.focus({ preventScroll: true }); }
  }, [selectedKey]);

  if (!selected) return null;
  const select = key => {
    if (key !== selectedKey) { focusNext.current = true; onChange(key); }
  };
  const onKeyDown = event => {
    const index = tabs.findIndex(item => item.key === selectedKey);
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    select(tabs[next].key);
  };
  const renderTab = (item, isActive = false) => (
    <button key={item.key} type="button" role="tab" aria-selected={isActive}
      aria-label={item.label} title={item.label} tabIndex={isActive ? 0 : -1}
      className={`${styles.tab} ${isActive ? styles.activeTab : styles.inactiveTab}`}
      onClick={() => select(item.key)}>
      <span className={styles.icon}><ClassicOrderIcon name={item.icon} /></span>
      {isActive ? <span className={styles.label}>{item.label}</span> : null}
    </button>
  );
  const before = tabs.slice(0, selectedIndex);
  const after = tabs.slice(selectedIndex + 1);
  return (
    <div className={styles.viewport} ref={railRef}>
      <div className={styles.rail} role="tablist" aria-label={label} aria-orientation="horizontal" onKeyDown={onKeyDown}>
        {before.length ? <div className={styles.group} role="presentation"><div className={styles.inactiveRail}>{before.map(item => renderTab(item))}</div></div> : null}
        <div className={`${styles.group} ${styles.activeGroup}`} role="presentation">{renderTab(selected, true)}</div>
        {after.length ? <div className={styles.group} role="presentation"><div className={styles.inactiveRail}>{after.map(item => renderTab(item))}</div></div> : null}
      </div>
    </div>
  );
}
