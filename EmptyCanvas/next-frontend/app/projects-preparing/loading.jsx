import styles from "./loading.module.css";

// Route-level Suspense fallback. Match the project index layout without
// displaying placeholder values or a second copy of the shared app header.
export default function ProjectsPreparingLoading() {
  return (
    <main className={styles.root} aria-busy="true" aria-label="Loading Projects Preparing">
      <span className={styles.screenReaderOnly} role="status">Loading Projects Preparing…</span>
      <div className={styles.hero} aria-hidden="true">
        <span className={`${styles.skeleton} ${styles.heroIcon}`} />
        <div className={styles.heroCopy}>
          <span className={`${styles.skeleton} ${styles.heroEyebrow}`} />
          <span className={`${styles.skeleton} ${styles.heroTitle}`} />
        </div>
        <div className={styles.parcels}><span/><span/><span/></div>
      </div>
      <div className={styles.stats} aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={`${styles.stat} ${styles[`stat${index}`]}`}>
            <span className={`${styles.skeleton} ${styles.statIcon}`} />
            <div className={styles.statCopy}>
              <span className={`${styles.skeleton} ${styles.statLabel}`} />
              <span className={`${styles.skeleton} ${styles.statValue}`} />
            </div>
          </div>
        ))}
      </div>
      <div className={styles.tabs} aria-hidden="true">
        <div className={styles.tabGroup}>
          <span className={`${styles.skeleton} ${styles.tabActive}`} />
          <span className={`${styles.skeleton} ${styles.tab}`} />
          <span className={`${styles.skeleton} ${styles.tab}`} />
          <span className={`${styles.skeleton} ${styles.tab}`} />
        </div>
        <span className={`${styles.skeleton} ${styles.count}`} />
      </div>
      <div className={styles.folders} aria-hidden="true">
        <div className={styles.addFolder}>
          <span className={`${styles.skeleton} ${styles.addIcon}`} />
          <span className={`${styles.skeleton} ${styles.addTitle}`} />
          <span className={`${styles.skeleton} ${styles.addCaption}`} />
        </div>
        <div className={styles.folder}>
          <span className={`${styles.skeleton} ${styles.folderPaper}`} />
          <span className={styles.folderFront}>
            <span className={`${styles.skeleton} ${styles.folderName}`} />
            <span className={`${styles.skeleton} ${styles.folderDetails}`} />
          </span>
        </div>
      </div>
    </main>
  );
}
