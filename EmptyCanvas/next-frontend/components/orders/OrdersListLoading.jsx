"use client";
// ERP_COMPACT_ORDER_LIST_LOADING_V1
import ClassicOrderIcon from "./ClassicOrderIcon";
import { orderLoadingIcon } from "./order-loading-icon.mjs";
import styles from "./OrdersListLoading.module.css";

// An indeterminate loader: it exists only while the existing list request is
// pending. No artificial delays, percentages or independent network calls.
export default function OrdersListLoading({ orderType }) {
  const icon = orderLoadingIcon(orderType);
  return (
    <div className={styles.root} role="status" aria-live="polite" aria-atomic="true">
      <div className={styles.content}>
        <div className={styles.indicator} aria-hidden="true">
          <span className={styles.track} />
          <span className={styles.spinner} />
          <span className={styles.badge}><ClassicOrderIcon name={icon} /></span>
        </div>
        <div className={styles.heading}>Loading orders...</div>
        <div className={styles.subtitle}>Please wait a moment</div>
        <div className={styles.skeletons} aria-hidden="true">
          {[0, 1, 2].map(index => (
            <div className={styles.card} key={index}>
              <span className={`${styles.block} ${styles.thumbnail}`} />
              <span className={styles.lines}>
                <span className={`${styles.block} ${styles.lineLong}`} />
                <span className={`${styles.block} ${styles.lineShort}`} />
              </span>
              <span className={`${styles.block} ${styles.pill}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
