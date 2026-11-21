import styles from "./loading.module.css";

// Match the live agenda layout while server data is loading. The long-lived
// AppShell already owns navigation chrome; do not render a second sidebar.
export default function EventsCalendarLoading() {
  return (
    <main className={styles.erpEventsLoadingRoot} aria-busy="true" aria-label="Loading Events">
      <span className={styles.visuallyHidden} role="status">Loading Events…</span>
      <section className={styles.stats} aria-hidden="true">
        {["total", "pending", "confirmed", "archived"].map((name, i) => (
          <div className={`${styles.stat} ${styles[name]}`} key={name}>
            <span className={`${styles.shimmer} ${styles.statIcon}`} />
            <div><span className={`${styles.shimmer} ${styles.statTitle}`} />
              <span className={`${styles.shimmer} ${styles.statNumber}`} /></div>
          </div>
        ))}
      </section>
      <section className={styles.layout} aria-hidden="true">
        <div className={styles.left}>
          <div className={styles.calendar}>
            <div className={styles.calendarHeading}>
              <span className={`${styles.shimmer} ${styles.nav}`} />
              <span className={`${styles.shimmer} ${styles.month}`} />
              <span className={`${styles.shimmer} ${styles.nav}`} />
            </div>
            <div className={styles.days}>
              {Array.from({ length: 7 }, (_, i) => (
                <span className={`${styles.shimmer} ${styles.day}`} key={i} />
              ))}
            </div>
            <div className={styles.legend}>
              <span className={`${styles.shimmer} ${styles.legendItem}`} />
              <span className={`${styles.shimmer} ${styles.legendItem}`} />
            </div>
          </div>
          <div className={`${styles.shimmer} ${styles.add}`} />
        </div>
        <div className={styles.agenda}>
          <div className={styles.tabs}>
            {[0, 1, 2].map((i) => <span className={`${styles.shimmer} ${styles.tab}`} key={i} />)}
          </div>
          <div className={styles.empty}>
            <span className={`${styles.shimmer} ${styles.emptyIcon}`} />
            <span className={`${styles.shimmer} ${styles.emptyTitle}`} />
            <span className={`${styles.shimmer} ${styles.emptyCaption}`} />
          </div>
        </div>
      </section>
    </main>
  );
}
